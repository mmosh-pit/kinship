// ============================================
// Kinship Studio — Navigation Structure
// Platform-level and Game-level nav definitions
// ============================================

export interface NavItem {
  key: string
  href: string
  label: string
  icon: string // Lucide icon name
  hint?: string // Subtitle hint text
  countKey?: string
  isNew?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── Platform-Level Navigation ──────────────────────────
// Shown when viewing a platform (not inside a game)

export const PLATFORM_NAV: NavGroup[] = [
  {
    label: 'AGENTS',
    items: [
      {
        key: 'agents', 
        href: '/agents',
        label: 'Agents',
        icon: 'UserRound',
      },
      // {
      //   key: 'chat',
      //   href: '/chat',
      //   label: 'Chat',
      //   icon: 'MessageCircle',
      //   isNew: true,
      // },
    ],
  },
  {
    label: 'CLARITY PROCESS',
    items: [
      {
        key: 'inform',
        href: '/knowledge',
        label: 'Inform',
        icon: 'Brain',
        hint: 'Knowledge & RAG',
      },
      {
        key: 'instruct',
        href: '/prompts',
        label: 'Instruct',
        icon: 'MessageSquareCode',
        hint: 'Behavior & Chains',
      },
      {
        key: 'empower',
        href: '/empower',
        label: 'Empower',
        icon: 'Plug2',
        hint: 'Tools & MCP',
      },
      {
        key: 'align',
        href: '/align',
        label: 'Align',
        icon: 'Workflow',
        hint: 'Orchestration',
      },
    ],
  },
  {
    label: 'GOVERNANCE',
    items: [
      {
        key: 'vibes',
        href: '/vibes',
        label: 'Vibes',
        icon: 'Activity',
        hint: 'Safety & Norms',
      },
      {
        key: 'offerings',
        href: '/offerings',
        label: 'Offerings',
        icon: 'Store',
        isNew: false,
      },
      {
        key: 'coins',
        href: '/coins',
        label: 'Coins',
        icon: 'Coins',
        isNew: false,
      },
      {
        key: 'codes',
        href: '/codes',
        label: 'Codes',
        icon: 'KeyRound',
        isNew: false,
      },
      
    ],
  },
  {
    label: 'EXPERIENCES',
    items: [
      {
        key: 'experiences',
        href: '/games',
        label: 'Experiences',
        icon: 'Compass',
      },
      {
        key: 'library',
        href: '/assets',
        label: 'Library',
        icon: 'Library',
        countKey: 'assets',
      },
      {
        key: 'upload',
        href: '/assets/upload',
        label: 'Upload',
        icon: 'UploadCloud',
      },
    ],
  },
  {
    label: 'BOX',
    items: [
      {
        key: 'context',
        href: '/context',
        label: 'Box',
        icon: 'FolderTree',
      },
    ],
  },
]

// ─── Game-Level Navigation ──────────────────────────────
// Shown when inside a specific game

export const GAME_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        key: 'dashboard',
        href: '/dashboard',
        label: 'Dashboard',
        icon: 'LayoutDashboard',
      },
      {
        key: 'analytics',
        href: '/analytics',
        label: 'Analytics',
        icon: 'BarChart3',
      },
      {
        key: 'realtime',
        href: '/realtime',
        label: 'Real-time',
        icon: 'Zap',
        isNew: true,
      },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        key: 'game-editor',
        href: '/game-editor',
        label: 'Game Editor',
        icon: 'Sparkles',
      },
      {
        key: 'scenes',
        href: '/scenes',
        label: 'Scenes',
        icon: 'Map',
        countKey: 'scenes',
      },
      {
        key: 'npcs',
        href: '/npcs',
        label: 'NPCs',
        icon: 'Users',
        countKey: 'npcs',
      },
      {
        key: 'challenges',
        href: '/challenges',
        label: 'Challenges',
        icon: 'Target',
        countKey: 'challenges',
      },
      {
        key: 'quests',
        href: '/quests',
        label: 'Quests',
        icon: 'Scroll',
        countKey: 'quests',
      },
      {
        key: 'routes',
        href: '/routes',
        label: 'Routes',
        icon: 'Route',
        countKey: 'routes',
      },
    ],
  },
  {
    label: 'Engagement',
    items: [
      {
        key: 'leaderboards',
        href: '/leaderboards',
        label: 'Leaderboards',
        icon: 'Trophy',
      },
      {
        key: 'achievements',
        href: '/achievements',
        label: 'Achievements',
        icon: 'Award',
      },
    ],
  },
  {
    label: 'Story',
    items: [
      {
        key: 'arcs',
        href: '/arcs',
        label: 'Story Arcs',
        icon: 'BookOpen',
      },
      {
        key: 'cycles',
        href: '/cycles',
        label: 'Cycles',
        icon: 'RefreshCw',
      },
      {
        key: 'worldmap',
        href: '/worldmap',
        label: 'World Map',
        icon: 'Globe',
      },
    ],
  },
  {
    label: '',
    items: [
      {
        key: 'game-settings',
        href: '/game-settings',
        label: 'Game Settings',
        icon: 'Settings',
      },
      {
        key: 'publish',
        href: '/publish',
        label: 'Publish',
        icon: 'Rocket',
      },
      {
        key: 'playtester',
        href: '/playtester',
        label: 'Playtester',
        icon: 'Play',
      },
    ],
  },
]