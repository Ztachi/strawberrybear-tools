export * from './model'
export { createNoteId, createProjectId, createTrackId } from './ids'
export { resolutionTicks, snapTick } from './snap'
export { createHistory, type History } from './history'
export { copyNotes, pasteNotes, type PasteOptions } from './clipboard'
export { notesInBox, pruneSelection } from './selection'
export {
  addNote,
  clampGroupDelta,
  clampInt,
  deleteNotes,
  moveNotes,
  resizeNotes,
  setNoteVelocity,
  MAX_PITCH,
  MAX_VELOCITY,
  MIN_NOTE_TICKS,
  MIN_PITCH,
  MIN_VELOCITY,
  type AddNoteInput,
} from './commands/notes'
export {
  addTrack,
  duplicateTrack,
  removeTrack,
  reorderTrack,
  updateTrack,
  TRACK_PALETTE,
  type AddTrackInput,
} from './commands/tracks'
export {
  bpmToTempo,
  createEmptyDocument,
  documentDurationMs,
  ensureDurationCovers,
  setDurationTicks,
  setTempo,
  setTimeSignature,
  tempoToBpm,
  DEFAULT_BARS,
  DEFAULT_BPM,
  DEFAULT_PPQ,
  MAX_BPM,
  MIN_BPM,
} from './commands/song'
export { quantizeNotes, transposeNotes, type QuantizeOptions } from './commands/quantize'
export { encodeMidi, assignChannels, type EncodeMidiOptions } from './midi/encode'
export { decodeMidi, type DecodeMidiOptions } from './midi/decode'
export {
  createEditorTransport,
  type EditorTransport,
  type EditorTransportOptions,
  type EditorTransportState,
  type SynthPort,
} from './transport'
export {
  computeProjectMeta,
  createEditorSession,
  createProject,
  type EditorSession,
  type EditorSessionOptions,
} from './session'
