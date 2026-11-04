//! 仅测试使用的本地 HTTP 服务，验证实际传输而不访问用户云服务。

use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

pub struct Reply {
    pub status: u16,
    pub body: Vec<u8>,
    pub delay: Duration,
}

impl Reply {
    pub fn new(status: u16, body: impl Into<Vec<u8>>) -> Self {
        Self {
            status,
            body: body.into(),
            delay: Duration::ZERO,
        }
    }
}

pub struct Server {
    stop: Arc<AtomicBool>,
    accepted: Arc<AtomicUsize>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub fn serve(handler: impl Fn(Request) -> Reply + Send + 'static) -> (String, Server) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let stop = Arc::new(AtomicBool::new(false));
    let running = stop.clone();
    let accepted = Arc::new(AtomicUsize::new(0));
    let connections = accepted.clone();
    let thread = thread::spawn(move || {
        while !running.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    // macOS 会让已接受连接继承监听器的非阻塞标志；读取超时不会清除该标志。
                    // 客户端刚完成连接、请求头尚未到达时仍需等待，避免立即 WouldBlock 并重置连接。
                    stream.set_nonblocking(false).unwrap();
                    connections.fetch_add(1, Ordering::SeqCst);
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let Some(request) = read_request(&mut stream) else {
                        continue;
                    };
                    let reply = handler(request);
                    if !reply.delay.is_zero() {
                        thread::sleep(reply.delay);
                    }
                    let header = format!("HTTP/1.1 {} OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nETag: \"test\"\r\nLast-Modified: Wed, 01 Jan 2025 00:00:00 GMT\r\nConnection: close\r\n\r\n", reply.status, reply.body.len());
                    let _ = stream.write_all(header.as_bytes());
                    let _ = stream.write_all(&reply.body);
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(2))
                }
                Err(_) => break,
            }
        }
    });
    (
        format!("http://{address}"),
        Server {
            stop,
            accepted,
            thread: Some(thread),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn accepted_connection_waits_for_delayed_request_headers() {
        let (base, server) = serve(|request| {
            assert_eq!(request.method, "GET");
            assert_eq!(request.path, "/delayed");
            Reply::new(200, b"ready".to_vec())
        });
        let mut client = TcpStream::connect(base.trim_start_matches("http://")).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        while server.accepted.load(Ordering::SeqCst) == 0 {
            assert!(Instant::now() < deadline, "本地测试服务未接受连接");
            thread::sleep(Duration::from_millis(1));
        }
        // 服务必须等待已建立连接的请求头，不能把尚未到达的数据当作断开。
        thread::sleep(Duration::from_millis(30));
        client
            .write_all(b"GET /delayed HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.ends_with("ready"));
    }
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut header = Vec::new();
    let mut byte = [0u8; 1];
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() > 64 * 1024 || stream.read(&mut byte).ok()? == 0 {
            return None;
        }
        header.push(byte[0]);
    }
    let text = String::from_utf8(header).ok()?;
    let mut lines = text.lines();
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.into();
    let path = first.next()?.into();
    let headers: HashMap<String, String> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.to_lowercase(), value.trim().to_owned()))
        .collect();
    if headers
        .get("expect")
        .is_some_and(|value| value.eq_ignore_ascii_case("100-continue"))
    {
        stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n").ok()?;
    }
    let length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if length > 1024 * 1024 {
        return None;
    }
    let mut body = vec![0u8; length];
    stream.read_exact(&mut body).ok()?;
    Some(Request {
        method,
        path,
        headers,
        body,
    })
}
