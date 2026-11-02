// Rest of imports
import type { PostOrPage, Author, Tag, Settings } from "@tryghost/content-api";
import { NODE_TYPES } from "./constants.ts"

type SettingsNode = Settings & {
    codeinjection_styles: string,
    id: number
}

export type NodeBuilderInput =
  | { type: typeof NODE_TYPES.Author; data: Author }
  | { type: typeof NODE_TYPES.Page; data: PostOrPage }
  | { type: typeof NODE_TYPES.Tag; data: Tag }
  | { type: typeof NODE_TYPES.Post; data: PostOrPage }
  | { type: typeof NODE_TYPES.Settings; data: SettingsNode }