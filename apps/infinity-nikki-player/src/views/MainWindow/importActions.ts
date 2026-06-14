import type { InjectionKey } from 'vue'

export interface MidiImportActions {
  selectFile: () => Promise<void>
  selectFolder: () => Promise<void>
}

export const midiImportActionsKey: InjectionKey<MidiImportActions> = Symbol('midiImportActions')
