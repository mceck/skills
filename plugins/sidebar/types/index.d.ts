export type ChangeRow = {
  code: string
  path: string
}

export type CommitRow = {
  short: string
  hash: string
  subject: string
  isPushed: boolean
}

export type ContextInfo = {
  tokens: number | null
  percent: number | null
  usd: number | null
}

export type ChangesInfo = {
  rows: ChangeRow[]
  isExpanded: boolean
}

export type GitInfo = {
  isRepo: boolean
  branch: string
  commits: CommitRow[]
  visible: number
}

export type McpRow = {
  name: string
  isLoaded: boolean
  tools: number
}

export type McpInfo = {
  rows: McpRow[]
  isExpanded: boolean
}

export type SkillsInfo = {
  names: string[]
  total: number
  isExpanded: boolean
}

export type Sections = {
  changes: boolean
  git: boolean
  mcp: boolean
  skills: boolean
}

declare module 'claude-code' {
  interface PluginState {
    sidebar: {
      title: Shaped<string>
      context: Shaped<ContextInfo>
      changes: Shaped<ChangesInfo>
      git: Shaped<GitInfo>
      mcp: Shaped<McpInfo>
      skills: Shaped<SkillsInfo>
      usedSkills: Shaped<string[]>
      sections: Shaped<Sections>
    }
  }
}
