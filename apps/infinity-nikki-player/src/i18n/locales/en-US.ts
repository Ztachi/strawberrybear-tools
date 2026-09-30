/**
 * @description: English translations
 */
export default {
  app: {
    title: 'Infinity Nikki Auto Player',
    overlayMode: 'Enter Overlay Mode',
  },
  windowControls: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  tabs: {
    files: 'Files',
    templates: 'Templates',
    midiEditor: 'MIDI Editor',
    onlineLibrary: 'Online Library',
    comingSoon: 'Coming Soon',
    comingSoonTip: 'This feature is under development...',
  },
  actions: {
    selectFile: 'Select MIDI File',
    selectFolder: 'Select Folder',
    clear: 'Clear',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    detail: 'Details',
    add: 'Add',
    create: 'Create',
    refresh: 'Refresh',
    backToTop: 'Back to top',
    confirm: 'OK',
  },
  headerNav: {
    back: 'Back',
    forward: 'Forward',
    refresh: 'Refresh Page',
  },
  player: {
    status: {
      idle: 'Idle',
      playing: 'Playing',
      paused: 'Paused',
    },
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    preview: 'Preview',
    stopPreview: 'Stop Preview',
    speed: 'Speed',
    template: 'Key Mapping',
    noTemplate: 'Not Selected',
    keyLog: 'Key Log',
    noKeyLog: 'No key log yet',
    pianoOn: 'Enable Piano',
    pianoOff: 'Disable Piano',
    pianoMode: 'Template Sound',
    autoMode: 'Auto Play',
    keyboardSim: 'Simulate Keys',
    keyboardSimTip:
      'When enabled, keys in the log are sent as real keyboard input and can be used with the game window (requires Template Sound to be enabled first)',
    noMedia: 'No song selected',
    selectSongToPlay: 'Select a song to play',
    queue: 'Play Queue',
    currentQueue: 'Current Queue',
    openQueue: 'Open Play Queue',
    openVirtualKeyboard: 'Open Virtual Keyboard',
    openSongDetail: 'Open Song Details',
    noQueue: 'No queued songs',
    playSong: 'Play Song',
    pauseSong: 'Pause Song',
  },
  midi: {
    noFiles: 'No MIDI files',
    currentFile: 'Current File',
    duration: 'Duration',
    tracks: 'Tracks',
    melodyNotes: 'Melody Notes',
    selectFileTip: 'Please select a MIDI file first',
    libraryEmpty: 'Playlist is empty',
    libraryEmptyTip: 'Click above to import MIDI files',
    confirmDelete: 'Remove this file from the list?',
    melodyInfo: 'Melody Info',
    totalNotes: 'Total Notes',
    activeNotes: 'Active Notes',
    trackList: 'Track List',
    detailTitle: 'Song Details',
    virtualKeyboard: 'Virtual Keyboard',
    notFound: 'Song not found',
    trackEnabled: 'Enabled',
    trackDisabled: 'Disabled',
    clickToEnable: 'Click to enable',
    clickToDisable: 'Click to disable',
    trackIndex: 'Track {n}',
    percussionTrack: 'Percussion',
    pianoRoll: {
      detach: 'Open in separate window',
      dock: 'Return to main window',
      focusWindow: 'Show track window',
      windowFailed: 'Track window failed: {error}',
      autoSwitch: 'Auto switch',
      autoSwitchHint:
        'Automatically show details for the currently playing song. Your playback queue stays unchanged.',
      overview: 'Tracks Overview',
      editor: 'Piano Roll',
      follow: 'Follow Playhead',
      following: 'Following',
      timeZoom: 'Time Zoom',
      pitchZoom: 'Pitch Zoom',
      notes: 'notes',
      empty: 'This track has no notes',
      playhead: 'Playhead: use Left and Right arrows to seek',
      fit: 'Fit Song',
      close: 'Close Piano Roll',
      hideEmptyTracks: 'Hide tracks without notes',
      noTracksWithNotes: 'No tracks contain notes',
      help: {
        title: 'Piano Roll Guide',
        done: 'Got it',
        intro:
          'The piano roll arranges notes by time and pitch to help you inspect melodies, compare tracks, and locate passages. The overview shows all tracks; the detail view shows one track with its keyboard and notes.',
        groups: {
          tracks: 'Browse tracks',
          view: 'Zoom and follow',
          position: 'Seek and manage details',
        },
        items: {
          selection: {
            label: 'Select and open',
            description:
              'Click to select a track; double-click to open its details. While details are open, click another track to switch, or double-click the current track to close.',
          },
          enabled: {
            label: 'Track switches',
            description:
              'The left switch controls whether a track plays. Toggling it does not select the track or seek.',
          },
          filter: {
            label: 'Empty tracks',
            description:
              'Use the filter to switch between tracks with notes and all tracks. Song preview hides empty tracks by default; the MIDI editor shows them so you can add notes.',
          },
          zoom: {
            label: 'Independent zoom',
            description:
              'Use the slider, trackpad pinch, or Ctrl/Command + wheel for time zoom; details also have pitch zoom. Views zoom independently, save per song, and restore when you return. Minimum time zoom fills one screen.',
          },
          scroll: {
            label: 'Scrolling',
            description:
              'Scroll inside the view you want to move. With Follow on, a horizontal gesture of a quarter of the visible width switches to manual browsing; small movements and vertical scrolling keep Follow on. With Follow off, browse freely even if the playhead leaves the view. Each view is independent.',
          },
          follow: {
            label: 'Follow Playhead',
            description:
              'A filled button means Follow is on. The playhead moves to the center, stays there as notes scroll, then moves to the end near the song’s tail. Click the button to resume Follow.',
          },
          seek: {
            label: 'Seek',
            description:
              'Click the ruler or drag the top playhead handle. Dragging previews the position; releasing commits one seek. Edges scroll automatically. Press Esc to cancel a drag.',
          },
          resize: {
            label: 'Resize and close',
            description:
              'Drag the thin top edge of details to resize, or focus it and use Up/Down. Use the close button on the right to return to the full overview.',
          },
          workspace: {
            label: 'Browse and edit',
            description:
              'The piano roll in song details helps you browse and seek during playback. Choose Edit This MIDI to draw, move, resize, and change note velocity in the MIDI editor. See its Help menu for editing instructions.',
          },
        },
      },
      resize: 'Resize piano roll: use Up and Down, Home for minimum, End for maximum',
      heightPercent: 'Height {value}%',
      seekFailed: 'Could not seek: {error}',
    },
  },
  keyboardPage: {
    title: 'Virtual Keyboard',
  },
  onlineLibrary: {
    disclaimer: 'For learning and non-commercial use only',
    searchPlaceholder: 'Search title, author, or tags',
    refresh: 'Sync',
    sync: 'Sync',
    retry: 'Retry',
    loading: 'Loading',
    importing: 'Importing',
    imported: 'Imported',
    play: 'Play',
    stopPlaying: 'Stop',
    syncedAt: 'Synced: {time}',
    empty: 'No online songs',
    unknownAuthor: 'Unknown author',
    prev: 'Previous',
    next: 'Next',
    pageInfo: '{page} / {total}',
    trackCount: '{count} tracks',
    noteCount: '{count} notes',
    fileSize: 'File size',
    filters: {
      genre: 'Genre',
      source: 'Source',
      difficulty: 'Difficulty',
      allGenres: 'All genres',
      allSources: 'All sources',
      allDifficulties: 'All difficulties',
    },
    genre: {
      classical: 'Classical',
      pop: 'Pop',
      anime: 'Anime',
      game: 'Game',
      movie: 'Movie',
      folk: 'Folk',
      electronic: 'Electronic',
      other: 'Other',
    },
    source: {
      internet: 'From the internet',
      original: 'Original',
      user_submit: 'User submitted',
      public_domain: 'Public domain',
    },
    difficulty: {
      unknown: 'Unknown',
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard',
      expert: 'Expert',
    },
    license: {
      unknown: 'Unknown',
      public_domain: 'Public domain',
      cc: 'Creative Commons',
      authorized: 'Authorized',
      copyrighted: 'Copyrighted',
    },
    detail: {
      title: 'Online Song Detail',
      notFound: 'Online song not found',
      notFoundDescription: 'The song may be unpublished, removed, or its link is invalid',
      description: 'Description',
      noDescription: 'No description',
      license: 'License',
      originalFilename: 'Original filename',
      downloadFilename: 'Download filename',
      sha256: 'SHA-256',
      publishedAt: 'Published at',
      entryDate: 'Entry date',
      createdAt: 'Created at',
      updatedAt: 'Updated at',
      back: 'Back to online library',
      actions: {
        detail: 'Detail',
      },
    },
    feedback: {
      loadFailed: 'Failed to load the online library',
      previewFailed: 'Failed to preview online song',
      importFailed: 'Failed to import online song',
      imported: 'Online song imported',
      detailLoadFailed: 'Failed to load online song detail',
    },
  },
  songList: {
    title: 'Playlists',
    allSongs: 'Song Management',
    defaultName: 'New Playlist',
    editTitle: 'Edit Playlist Info',
    totalSongs: '{count} songs',
    selectedCount: '{count} selected',
    searchPlaceholder: 'Search songs',
    noSongs: 'No songs',
    noSearchResults: 'No songs found',
    notFound: 'Playlist not found',
    emptyDescription: 'No description',
    fields: {
      name: 'Playlist Name',
      description: 'Description',
    },
    actions: {
      batch: 'Batch',
      exitBatch: 'Exit Batch',
      addTo: 'Add to',
      removeFromSongList: 'Remove from Playlist',
      deleteFile: 'Delete File',
      rename: 'Rename',
      export: 'Export',
      exportAll: 'Export All',
      import: 'Import',
      more: 'More actions',
      collapseSidebar: 'Collapse Sidebar',
      expandSidebar: 'Expand Sidebar',
    },
    cover: {
      edit: 'Edit Cover',
      modalTitle: 'Choose Playlist Cover',
      uploadTitle: 'Drop an image or click to choose',
      uploadHint: 'The image will be cropped to a 1:1 square',
      reselect: 'Choose Again',
    },
    validation: {
      nameRequired: 'Playlist name is required',
      nameMax: 'Playlist name can be up to 20 characters',
      nameInvalid: 'Playlist name cannot contain <>:"/\\|?* or control characters',
      descriptionMax: 'Description can be up to 1000 characters',
    },
    confirm: {
      deleteTitle: 'Delete Playlist',
      deleteDescription: 'Delete "{name}"? Local MIDI files will not be deleted.',
      removeSongTitle: 'Remove from Playlist',
      removeSongDescription: 'This only removes the song from the playlist. The local file stays.',
      batchRemoveTitle: 'Remove Selected Songs',
      batchRemoveDescription: 'Remove {count} selected songs from this playlist?',
      deleteFileTitle: 'Delete Local File',
      deleteFileDescription: 'This deletes the local MIDI file and removes it from every playlist.',
      batchDeleteFileTitle: 'Delete Local Files',
      batchDeleteFileDescription:
        'This deletes {count} selected local MIDI files and removes them from every playlist.',
      leaveTitle: 'Unsaved playlist info',
      leaveDescription: 'Unsaved changes will be lost after leaving.',
      discard: 'Discard and Leave',
    },
    feedback: {
      loadFailed: 'Failed to load playlists',
      createFailed: 'Failed to create playlist',
      saveFailed: 'Failed to save playlist',
      saved: 'Playlist saved',
      renameFailed: 'Failed to rename playlist',
      deleted: 'Playlist deleted',
      deleteFailed: 'Failed to delete playlist',
      added: 'Added to playlist',
      addFailed: 'Failed to add to playlist',
      removed: 'Removed from playlist',
      removeFailed: 'Failed to remove from playlist',
      coverFailed: 'Failed to save cover',
      exported: 'Playlist exported',
      exportFailed: 'Failed to export playlist',
      importedCount: '{count} playlists imported',
      importFailed: 'Failed to import playlists',
    },
  },
  dragdrop: {
    title: 'Drop MIDI files here',
    hint: 'Supports .mid and .midi files',
    folderHint: 'Folders are also supported and will import MIDI files inside',
    invalidTitle: 'Unsupported files',
    invalidDescription:
      'Only .mid and .midi files can be imported directly. You can also drop folders to batch import MIDI files.',
  },
  permissions: {
    required: 'Accessibility Required',
    reauthorizeTip:
      'If macOS still reports no permission after an update, remove the old app entry from Accessibility, restart the app, and authorize it again.',
  },
  template: {
    title: 'Template Management',
    description: 'Create, edit, import, and export game keyboard mapping templates',
    name: 'Template Name',
    builtin: 'Built-in',
    custom: 'Custom',
    newTemplate: 'New Template',
    editTemplate: 'Edit Template',
    createTemplate: 'Create Template',
    blankTemplate: 'Blank Template',
    copyTemplate: 'Copy Template',
    createFromTemplate: 'Create from Template',
    createFromTemplateShort: 'Create From',
    importTemplate: 'Import Template',
    exportTemplate: 'Export Template',
    batchExport: 'Batch Export',
    batchDelete: 'Batch Delete',
    templateList: 'Templates',
    notFound: 'Template not found',
    confirmDelete: 'Are you sure you want to delete this template?',
    confirmBatchDelete: 'Delete {count} selected custom templates? This cannot be undone.',
    pitch: 'Pitch',
    key: 'Key',
    addMapping: 'Add Mapping',
    mappings: 'Mappings',
    mappingCount: '{count} mappings',
    copyName: '{name} Copy',
    unmapped: 'Unmapped',
    mappingActive: 'Editing',
    editMode: 'Edit Mode',
    overviewMode: 'Overview',
    exitOverview: 'Exit Overview',
    editModeTip: 'Keys keep a fixed width. Drag or scroll horizontally to inspect other ranges.',
    overviewModeTip: 'All 88 keys fit on screen for quick mapping and key highlight checks.',
    mapSelected: 'Start Editing',
    exitMapping: 'Stop Editing',
    clearMapping: 'Clear Mapping',
    undoMapping: 'Undo',
    redoMapping: 'Redo',
    editorHelp: 'Template Editor Help',
    mappingHelpTitle: 'Editing state',
    mappingHelpDescription:
      'Enable it, click any piano key, then press a keyboard key to write the mapping. Esc, Backspace, or Delete clears the selected piano key mapping.',
    helpBasicTitle: 'Basics',
    helpSelectPianoKey:
      'Click a piano key to select and preview that pitch. Scroll or drag horizontally to inspect other ranges.',
    helpPreviewMode:
      'Use the expand icon for an all-key overview. All 88 keys fit on screen; use the collapse icon to return to fixed-width editing.',
    helpKeyboardPreview:
      'The keyboard preview highlights the physical key mapped to the selected pitch. Clicking a mapped key also jumps back to its piano key.',
    helpMappingTitle: 'Editing mappings',
    helpEnableMapping:
      'Click Start Editing on the right, select a piano key, then press a physical key to write the mapping.',
    helpWriteMapping: 'Editing stays enabled so you can assign several pitches in sequence.',
    helpClearMapping:
      'Only after editing starts, use the eraser icon, Escape, Backspace, or Delete to clear the selected pitch mapping.',
    helpMappingConflict:
      'One physical key can map to only one pitch. A new mapping automatically removes the previous pitch that used that key.',
    helpHistoryTitle: 'Undo and redo',
    helpUndoRedoButtons:
      'Undo and redo only track mapping changes. They do not restore selected pitch or preview mode.',
    helpUndoRedoShortcuts:
      'Use Ctrl/Command+Z to undo, and Ctrl/Command+Shift+Z or Ctrl/Command+Y to redo.',
    helpHistoryScope:
      'Opening, switching templates, or loading a draft starts a new history baseline, so history never crosses templates.',
    helpAttentionTitle: 'Notes',
    helpSaveReminder:
      'Undo and redo modify only the current editing draft. Click Save to write changes into the template file.',
    helpUnsupportedKeys:
      'Fn, Win/Command, Ctrl, Alt, Shift, CapsLock, media keys, power keys, and other system or modifier keys cannot be saved as mappings.',
    helpSystemKeySilent:
      'Modifier keys used in system shortcuts are ignored silently, so pressing Command+S does not show an unsupported-key warning.',
    supportedKeys: 'Supported keys',
    unsupportedKeys: 'Unsupported keys',
    unsupportedKeysDescription:
      'Fn, Win/Command, Ctrl, Alt, Shift, CapsLock, media keys, power keys, and other system or modifier keys are not supported.',
    unsupportedKey: 'This key cannot be used for mapping',
    nameRequired: 'Template name is required',
    nameInvalid:
      'Template names can be up to 30 characters and must be valid Windows and macOS file names. Do not use <>:"/\\|?*, control characters, trailing spaces or dots, or reserved system names.',
    nameDuplicated: 'Template names must be unique',
    saved: 'Template saved',
    saveFailed: 'Failed to save template',
    deleted: 'Template deleted',
    batchDeleted: '{count} templates deleted',
    deleteFailed: 'Failed to delete template',
    imported: 'Template imported',
    importedCount: '{count} templates imported',
    importFailed: 'Failed to import template',
    exported: 'Template exported',
    exportedCount: '{count} templates exported',
    exportFailed: 'Failed to export template',
    unsaved: 'Unsaved',
    searchPlaceholder: 'Search template name',
    selectedCount: '{count} selected',
    totalCount: '{count} total',
    paginationTotal: '{start}-{end} of {total} templates',
    type: 'Type',
    mappingTotal: 'Mappings',
    templateId: 'Template ID',
    actions: 'Actions',
    currentTemplate: 'In use',
    useTemplate: 'Use',
    noTemplates: 'No templates found',
    pageSize: 'Per page',
    prevPage: 'Prev',
    nextPage: 'Next',
    pageInfo: 'Page {page} / {total}',
    drawerDescription: 'Edit the template name and piano key mappings.',
    save: 'Save',
    saveAndExit: 'Save and Exit',
    discardAndExit: 'Exit Without Saving',
    saveAndJump: 'Save and Jump',
    leaveConfirmTitle: 'Unsaved template changes',
    leaveConfirmCloseDescription:
      'Choose whether to save or discard your changes before leaving the editor.',
    leaveConfirmJumpDescription:
      'MIDI import needs to jump to the Files tab first. Choose how to handle current template changes.',
    draftFound: 'Draft Found',
    loadDraft: 'Load Draft',
    discardDraft: 'Discard Draft',
    loadDraftPrompt:
      'An unsaved template draft was found. Load it? Cancel keeps the draft and returns.',
    emptyEditor: 'Select or create a custom template',
    emptyEditorTip: 'Built-in templates can be copied before editing so defaults are preserved.',
    builtinNames: {
      piano: 'Piano',
      'game-4rows': 'FreePiano',
      '21keys': '21 Keys',
      '14keys': '14 Keys',
    },
  },
  midiEditor: {
    title: 'MIDI Editor',
    description:
      'Create, edit, import and export MIDI projects; export .mid or add to the library when done',
    projectList: 'Projects',
    newProject: 'New Project',
    untitled: 'Untitled Project',
    editProject: 'Edit Project',
    createFromProject: 'New From This',
    editThisMidi: 'Edit This MIDI',
    importProject: 'Import',
    importHint: 'Supports .json / .zip project files and .mid files',
    exportProject: 'Export Project',
    exportMidi: 'Export .mid',
    moreActions: 'More actions',
    closeEditor: 'Close',
    addToLibrary: 'Add to Player',
    batchExport: 'Batch Export',
    batchDelete: 'Batch Delete',
    name: 'Name',
    tracks: 'Tracks',
    notes: 'Notes',
    duration: 'Duration',
    updatedAt: 'Updated',
    source: 'Source',
    actions: 'Actions',
    searchPlaceholder: 'Search project name',
    noProjects: 'No MIDI projects yet',
    noProjectsTip: 'Click "New Project", or choose "Edit This MIDI" on a song detail page.',
    notFound: 'Project not found',
    confirmDelete: 'Delete project "{name}"?',
    confirmBatchDelete: 'Delete {count} selected projects?',
    saved: 'Project saved',
    saveFailed: 'Failed to save project',
    templateSelectFailed: 'Failed to switch key mapping',
    deleted: 'Project deleted',
    batchDeleted: 'Deleted {count} projects',
    deleteFailed: 'Failed to delete project',
    imported: 'Project imported',
    importedCount: 'Imported {count} projects',
    importFailed: 'Failed to import project',
    exported: 'Project exported',
    exportedCount: 'Exported {count} projects',
    exportFailed: 'Export failed',
    midiExported: 'MIDI file exported',
    addedToLibrary: 'Added to the player library',
    addToLibraryFailed: 'Failed to add to player',
    loadFailed: 'Failed to load project',
    sourceMidiMissing: 'Source MIDI file not found',
    nameRequired: 'Project name is required',
    nameInvalid:
      'Project name must be at most 30 characters and a valid Windows/macOS file name: no <>:"/\\|?* or control characters, no trailing space or dot, and no reserved names',
    nameDuplicated: 'Project name already exists',
    unsaved: 'Unsaved',
    windowOpen: 'This project is open in a separate window',
    focusWindow: 'Show Window',
    restoreWindow: 'Return to Main Window',
    windowFailed: 'Separate editor window failed: {error}',
    detachedBusy: 'Another project is open in a separate editor window',
    activeProjectCannotDelete: 'Close the project editor before deleting this project',
    draftFound: 'Draft Found',
    loadDraft: 'Load Draft',
    discardDraft: 'Discard Draft',
    loadDraftPrompt: 'An unsaved draft was found. Load it? Cancel keeps the draft and goes back.',
    leaveConfirmTitle: 'Unsaved project changes',
    leaveConfirmDescription: 'Save or discard your changes before leaving the editor.',
    saveAndClose: 'Save and Close',
    discardAndClose: 'Close Without Saving',
    trackDefaultName: 'Track {index}',
    trackCopyName: '{name} copy',
    addTrack: 'Add Track',
    editTrack: 'Edit Track',
    presetTrackColors: 'Preset colors',
    tour: {
      tracks: {
        title: 'Start with the track overview',
        description:
          'See each track and its position in the song. Use the plus button to add a track and the switches to control which tracks are enabled.',
      },
      edit: {
        title: 'Double-click a track to edit',
        description:
          'Double-click a track name or its content to open the piano roll, or choose Edit Track at the top of its menu. Click other tracks to switch while details are open.',
      },
      sort: {
        title: 'Drag the handle to reorder',
        description:
          'Drag the handle on the left immediately, including with Mac Three Finger Drag. You can also hold the track name for about 0.3 seconds before dragging. Switches and menus work independently.',
      },
      tools: {
        title: 'Edit, preview, and save',
        description:
          'Move and resize notes with Select, or add notes with Draw. Selecting notes in details opens the inspector. Preview and set snapping from the header, save on the right, and find the full guide in the Help menu.',
      },
    },
    dragTrack: 'Drag to reorder: {name}',
    renameTrack: 'Rename Track',
    trackColor: 'Track Color',
    duplicateTrack: 'Duplicate Track',
    moveTrackUp: 'Move Up',
    moveTrackDown: 'Move Down',
    deleteTrack: 'Delete Track',
    percussionTrack: 'Percussion Track',
    confirmDeleteTrack: 'Track "{name}" has {count} notes. Delete it?',
    lastTrack: 'At least one track must remain',
    toolbar: {
      songSettings: 'Song settings',
      songSettingsTip:
        'Set the song BPM and meter. Songs with multiple changes ask before they are unified.',
      displaySettings: 'Display',
      displaySettingsTip: 'Show or hide the velocity lane without changing MIDI data.',
      bpm: 'BPM',
      bpmTip:
        'Set beats per minute; higher values play faster. Songs with tempo changes require confirmation before replacing them with one tempo.',
      timeSignature: 'Meter',
      timeSignatureTip:
        'The left value is beats per bar; the right is the note value of one beat. For example, 3/4 means three quarter notes per bar.',
      snap: 'Snap',
      snapTip:
        'Set the grid for adding, moving, resizing and quantizing notes. Hold Option/Alt while dragging to temporarily bypass snapping.',
      snapEnabled: 'Enable Snap',
      snapToBar: 'Snap to Bar',
      snapResolution: 'Beat Grid',
      snapOff: 'Off',
      snapBar: 'Bar',
      tool: 'Tool',
      select: 'Select (V)',
      draw: 'Draw (B)',
      undo: 'Undo (⌘/Ctrl+Z)',
      redo: 'Redo (⌘/Ctrl+Shift+Z)',
      play: 'Play (Space)',
      pause: 'Pause (Space)',
      stop: 'Stop',
      loop: 'Loop Region',
      clearLoop: 'Clear Loop',
      loopTip:
        'Hold Option/Alt while dragging on the time ruler to set a preview loop; double-click the ruler to clear it. Once set, this button also clears the loop.',
      clearLoopTip:
        'Click to clear the current loop, or double-click the time ruler. Hold Option/Alt while dragging on the ruler to set a new region.',
      velocityLane: 'Velocity Lane',
      velocityLaneTip:
        'Show or hide the bottom velocity lane. Drag bars vertically to adjust velocity; selected notes change together.',
      templatePreview: 'Preview by Template',
      templatePreviewHelp: 'About Preview by Template',
      templatePreviewTip:
        'Audition playable notes using the current template and dim notes outside it to check the performance.',
      help: 'Help',
      replaceTempoTitle: 'Replace with a single tempo',
      replaceTempoDescription:
        'This MIDI has multiple tempo changes. Changing BPM replaces them with one tempo for the whole song.',
      replaceMeterTitle: 'Replace with a single meter',
      replaceMeterDescription:
        'This MIDI has multiple meter changes. Changing the meter replaces them with one meter for the whole song.',
      replace: 'Replace',
    },
    inspector: {
      title: 'Notes',
      noteTip:
        'Edit the pitch, position, length, and velocity of selected notes. Batch actions apply to the whole selection.',
      selectedCount: '{count} notes selected',
      pitch: 'Pitch',
      start: 'Start',
      length: 'Length',
      velocity: 'Velocity',
      quantize: 'Quantize',
      quantizeTip:
        'Align starts to the current snap grid or round lengths to grid multiples. Does nothing when snapping is off.',
      quantizeStart: 'Quantize Start',
      quantizeStartTip:
        'Select notes, then align their start times to the current snap grid without changing their lengths. Does nothing when snapping is off.',
      quantizeLength: 'Quantize Length',
      quantizeLengthTip:
        'Round selected note lengths to multiples of the current snap grid without moving their start times. Does nothing when snapping is off.',
      transpose: 'Transpose',
      transposeGroupTip:
        'Move selected notes up or down. ±1 means one semitone; ±Octave means twelve semitones.',
      transposeTip:
        'Move selected notes by {semitones} semitones without changing their start times or lengths. Twelve semitones equal one octave.',
      octaveUp: '+Octave',
      octaveDown: '-Octave',
      semitoneUp: '+1',
      semitoneDown: '-1',
      unplayableCount: '{count} notes unplayable',
    },
    contextMenu: {
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      duplicate: 'Duplicate',
      delete: 'Delete',
      selectAll: 'Select All',
      quantize: 'Quantize to Grid',
      transposeUp: 'Up an Octave',
      transposeDown: 'Down an Octave',
      setVelocity: 'Set Velocity',
      addNote: 'Add Note Here',
      setLoopToSelection: 'Loop Selection',
    },
    help: {
      menuLabel: 'Help',
      title: 'MIDI Editor Help',
      done: 'Got it',
      contents: 'Help contents',
      overviewTitle: 'How to use the editor',
      intro:
        'Find a track in the overview, open its details to edit notes, then preview and save your project. Start with these three essential actions and use the contents on the left for settings and shortcuts.',
      essentials: {
        edit: {
          label: 'Double-click a track to open the editor',
          description:
            'Double-click its name or overview content, or choose Edit Track from its menu. Click another track to switch while details are open.',
        },
        sort: {
          label: 'Drag the left handle to reorder tracks',
          description:
            'Drag the handle immediately, including with Mac Three Finger Drag. You can also hold the track name for about 0.3 seconds before dragging.',
        },
        notes: {
          label: 'Select notes to edit their properties',
          description:
            'Select or box-select notes in details to show pitch, length, velocity, and batch actions. Clearing the selection or closing details hides the inspector.',
        },
      },
      selectTool:
        'Select tool: click to select, Shift to add; drag on empty space for box selection; double-click empty space to add a note; drag a note to move, drag its edges to resize; hold Option/Alt to disable snapping.',
      drawTool: 'Draw tool: click to add a note, drag horizontally to set its length.',
      loop: 'Loop: hold Option/Alt while dragging on the ruler to set the loop region; double-click the ruler to clear it.',
      velocity: 'Velocity: drag bars in the bottom lane; multiple selected notes change together.',
      shortcuts:
        'Shortcuts: Delete/Backspace removes, Command/Ctrl+A selects all, Command/Ctrl+C/X/V copy/cut/paste, Command/Ctrl+D duplicates, Command/Ctrl+Z undoes, Command/Ctrl+Shift+Z redoes; arrow keys nudge (Shift for octave/bar), Space plays/pauses, Esc clears selection, V/B switch tools.',
      playback:
        'Preview plays only this project and never triggers in-game keys; the global player pauses when preview starts.',
      sections: {
        start: {
          title: 'Getting Started',
          items: {
            layout: {
              label: 'Layout',
              description:
                'Use the header for the project name, tools, preview, and settings. The center contains the overview and piano-roll detail; selecting notes with details open shows the inspector at the bottom.',
            },
            overview: {
              label: 'Double-click to open track details',
              description:
                'Click a track to select it and double-click to open details, or choose Edit Track from its menu. Click another track to switch while details are open, or double-click the current track to close it.',
            },
            template: {
              label: 'Key Template',
              description:
                'Use the keyboard icon to select a key template and enable Preview by Template. Playback and individual audition use the playable notes in the current template, while notes outside it are dimmed to help check the performance and identify passages that need arranging. Turn it off to audition all notes.',
            },
          },
        },
        notes: {
          title: 'Note Editing',
          items: {
            select: {
              label: 'Select Tool',
              description:
                'Click to select, Shift-click to add, or drag empty space for box selection. Double-click empty space to add a note. Drag notes to move them or drag either edge to resize.',
            },
            draw: {
              label: 'Draw Tool',
              description:
                'Click empty space to add a note, or press and drag horizontally to set its length while creating it.',
            },
            inspector: {
              label: 'Note Properties',
              description:
                'Selecting notes with details open shows the inspector for pitch, length, velocity, quantization, and transposition. Batch actions apply to every selected note. Clearing the selection or closing details hides the inspector.',
            },
            contextMenu: {
              label: 'Context Menu',
              description:
                'Right-click a note or empty space for cut, copy, paste, duplicate, quantize, transpose, velocity presets, loop-to-selection, and delete actions.',
            },
          },
        },
        tracks: {
          title: 'Track Management',
          items: {
            trackView: {
              label: 'Add and Inspect',
              description:
                'The plus button in the overview adds a track and opens its detail immediately. Each track shows its own notes and can be edited in overview or detail view.',
            },
            trackManage: {
              label: 'Reorder and Track Menu',
              description:
                'Hold a track name for about 0.3 seconds, then drag vertically, or drag immediately from the left handle. On a Mac with Three Finger Drag enabled, start from the handle. The menu provides editing, rename, recolor, percussion, duplicate, move up, move down, and delete. The color picker offers presets and custom colors. Tracks share one default color; choosing a color updates the menu swatch, overview notes and region, and detail notes together. Colors are saved with the project. A project always keeps at least one track.',
            },
            trackEnabled: {
              label: 'Enabled State',
              description:
                'Use the track switch to control whether a track is enabled. Disabled tracks keep their note data so they can be restored later.',
            },
          },
        },
        playback: {
          title: 'Preview and Loop',
          items: {
            transport: {
              label: 'Transport',
              description:
                'Use Play to start or pause and Stop to end preview. The Space key also toggles play and pause.',
            },
            seek: {
              label: 'Position and Follow',
              description:
                'Use the time ruler to position the playhead. While playing, Follow keeps the current position in view.',
            },
            loop: {
              label: 'Loop Range',
              description:
                'Hold Option/Alt and drag on the ruler, or set a loop from the note context menu. Double-click the ruler or click the active loop button to clear it.',
            },
            preview: {
              label: 'Preview Scope',
              description:
                'The editor previews only this project and never sends game keys. Starting preview automatically pauses the global player.',
            },
          },
        },
        settings: {
          title: 'Snap and Display',
          items: {
            snap: {
              label: 'Grid Snap',
              description:
                'Move, resize, and draw against the selected beat grid. Bar snap disables the beat selector. Hold Option/Alt during an editing gesture to bypass snapping temporarily.',
            },
            song: {
              label: 'Song Settings',
              description:
                'Change the project BPM and time signature. For MIDI files with multiple tempo or meter changes, confirming replaces them with one setting for the whole song.',
            },
            display: {
              label: 'Display Settings',
              description:
                'Show or hide the velocity lane in Song Settings. Preview by Template in the key-template popover dims and mutes notes outside the template to identify passages that need arranging or transposing.',
            },
            view: {
              label: 'Navigate the View',
              description:
                'Use time zoom to change horizontal density and Fit Song for an overview. When there are many tracks, tracks without notes can be hidden.',
            },
          },
        },
        files: {
          title: 'Save and Export',
          items: {
            save: {
              label: 'Save Project',
              description:
                'Use the Save icon or Command/Ctrl+S to store an editable project. The status dot next to the project name means there are unsaved changes.',
            },
            export: {
              label: 'Export MIDI',
              description:
                'Export .mid creates a standard MIDI file for other music software. Exporting does not replace saving the editable project.',
            },
            leave: {
              label: 'Leave the Editor',
              description:
                'Save and Close saves before leaving. Close asks whether to save, discard, or cancel when the project has unsaved changes.',
            },
          },
        },
      },
      shortcutTitle: 'Keyboard Shortcuts',
      shortcutTip:
        'Editor shortcuts pause while an input, menu, or dialog has focus. Select text and press Command/Ctrl+C to copy help content.',
      shortcutItems: {
        save: { keys: 'Command/Ctrl + S', description: 'Save the project' },
        undo: { keys: 'Command/Ctrl + Z', description: 'Undo the previous edit' },
        redo: { keys: 'Command/Ctrl + Shift + Z / Y', description: 'Redo' },
        selectAll: { keys: 'Command/Ctrl + A', description: 'Select all notes' },
        clipboard: { keys: 'Command/Ctrl + C / X / V', description: 'Copy, cut, and paste' },
        duplicate: { keys: 'Command/Ctrl + D', description: 'Duplicate selected notes' },
        delete: { keys: 'Delete / Backspace', description: 'Delete selected notes' },
        horizontal: {
          keys: 'Left / Right',
          description: 'Nudge by grid; hold Shift to move by bar',
        },
        vertical: {
          keys: 'Up / Down',
          description: 'Move by semitone; hold Shift to move by octave',
        },
        playback: { keys: 'Space', description: 'Play or pause preview' },
        clearSelection: { keys: 'Esc', description: 'Clear the note selection' },
        tools: { keys: 'V / B', description: 'Switch to Select / Draw tool' },
        snapOverride: {
          keys: 'Option / Alt',
          description: 'Bypass snap during edits; drag the ruler to set a loop',
        },
      },
    },
  },
  pagination: {
    perPage: 'Per page',
  },
  log: {
    title: 'Key Log',
    count: '{count}/50',
    empty: 'No key logs',
    action: {
      press: 'Press',
      release: 'Release',
    },
  },
  overlay: {
    expand: 'Expand',
    collapse: 'Collapse',
    close: 'Close Overlay',
    exitOverlay: 'Exit Overlay Mode',
    noFile: 'No file selected',
    playlist: 'Playlist',
    playPrev: 'Previous',
    playNext: 'Next',
    locateCurrent: 'Locate',
    stop: 'Stop',
    mute: 'Mute',
    unmute: 'Unmute',
    fpsLabel: 'FPS',
    fpsAuto: 'Auto',
    fpsAutoBeta: '(beta)',
    playbackModes: {
      sequential: 'Sequential',
      shuffle: 'Shuffle',
      'repeat-one': 'Repeat One',
      'repeat-all': 'Repeat All',
      'play-once': 'Play Once',
    },
    fpsBetaWarning: 'Auto FPS detection is experimental. Enable it with caution.',
    fpsAutoTip:
      'When enabled, it detects game FPS before playback and adjusts key hold and gap timing.',
    fpsManualTip:
      'Auto detect is off and 60 FPS is used by default. You can enter the game FPS manually.',
    fpsUnsupported: 'Auto detect is not supported on this platform. Enter the game FPS manually.',
    fpsWaiting:
      'No game FPS detected yet. Make sure the game is running; manual FPS will be used first.',
    fpsMissing: 'Auto detect component is missing. Enter the game FPS manually.',
    fpsPermissionDenied:
      'Auto detect needs Windows frame capture permission. Enter the game FPS manually.',
    fpsError: 'Auto detect failed. Enter the game FPS manually.',
  },
  status: {
    ready: 'Ready',
    playing: 'Playing',
    paused: 'Paused',
    stopped: 'Stopped',
  },
  errors: {
    loadFailed: 'Load failed',
    parseFailed: 'Parse failed',
    playFailed: 'Play failed',
  },
  updater: {
    availableTitle: 'Update available',
    availableDescription: 'Version {version} is available',
    checkNow: 'Check updates',
    checking: 'Checking',
    updateNow: 'Update',
    downloading: 'Downloading',
    downloadingProgress: 'Downloading {progress}%',
    installing: 'Installing',
    noUpdateTitle: 'You are up to date',
    noUpdateDescription: 'No update is available for this version',
    checkFailed: 'Update check failed',
    installFailed: 'Update failed',
    installFailedDescription:
      'Retry or install manually. Export local diagnostics for troubleshooting.',
    openRelease: 'Open releases',
    retry: 'Check again',
    preparing: 'Confirming unsaved changes',
    installNow: 'Install and restart',
    retryDownload: 'Retry update',
    cancelDownload: 'Cancel download',
    manualGithub: 'Download (GitHub)',
    manualDownload: 'Download manually',
    manualMirror: 'Download (mirror)',
    exportDiagnostics: 'Export diagnostics',
    diagnosticsExported: 'Diagnostics exported',
    lastChecked: 'Last attempt: {time}',
    notApplied: 'Previous update has not taken effect',
    notAppliedDescription:
      'The target was {version}; you are running {current}. Retry or install manually, and check which installation you opened.',
    applied: 'Confirmed running version {version}',
    sources: { mirror: 'Mirror', github: 'GitHub direct' },
    phases: {
      idle: 'Updates have not been checked',
      checking: 'Checking for updates',
      upToDate: 'No newer version found',
      available: 'An update is available',
      downloading: 'Downloading and verifying',
      ready: 'Download verified. Ready to install and restart',
      installing: 'Installing. Version will be verified after restart',
      error: 'Update failed',
    },
    errors: {
      timeout: 'The update source timed out. Retry or download manually.',
      network:
        'Update sources are unavailable. Check your connection, retry, or download manually.',
      invalidManifest:
        'The source returned invalid version information. Retry later or download manually.',
      signature:
        'Signature verification failed. Installation was blocked. Download again or install manually.',
      unsupportedPlatform: 'The source has no package for this platform. Check the release page.',
      storage:
        'Could not save the installation record. Check disk space and permissions, then retry.',
      operationFailed:
        'The operation could not finish. You can retry, install manually, or export diagnostics.',
    },
  },
  about: {
    title: 'About',
    version: 'Version',
    description:
      'A MIDI auto-play tool for Infinity Nikki. Import MIDI files and let the app simulate key presses in-game.',
    learnMore: 'Learn More',
    officialSite: 'Official Site',
    contact: 'Contact',
    contacts: [
      {
        type: 'qq',
        label: 'QQ Group',
        account: '967529814',
      },
      {
        type: 'discord',
        label: 'Discord',
        account: 'ztachi.',
      },
    ],
  },
}
