'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import PlatformSwitcher from './PlatformSwitcher'
import GameSwitcher from './GameSwitcher'

export default function StudioHeader() {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <header className="flex items-center gap-3 px-6 py-2 h-[60px] border-b border-card-border bg-background sticky top-0 z-50">
      {/* Left: Logo */}
      <Link href="/agents" className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#eb8000] to-amber-700 flex items-center justify-center shadow-lg shadow-accent/20">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="text-white font-bold text-lg tracking-wide">KINSHIP</span>
        <span className="bg-accent text-white text-xs font-bold px-2 py-0.5 rounded">
          STUDIO
        </span>
        
      </Link>

      <PlatformSwitcher />
      <GameSwitcher />
      <div className="flex-1" />

      <div className="dropdown dropdown-end">
        <div
          tabIndex={0}
          role="button"
          className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {/* User Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#eb8000] to-amber-700 flex items-center justify-center overflow-hidden text-white text-sm font-medium">
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt={user.name || 'User'}
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.parentElement!.textContent =
                    user?.name?.charAt(0).toUpperCase() || 'U'
                }}
              />
            ) : (
              <span>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            )}
          </div>
        </div>

        {/* Dropdown Menu */}
        <ul
          tabIndex={0}
          className="dropdown-content z-[100] menu p-2 shadow-lg bg-card border border-card-border rounded-xl w-56 mt-2"
        >
          {/* User Info */}
          <li className="px-3 py-2">
            <div className="flex flex-col bg-transparent hover:bg-transparent cursor-default p-0">
              <span className="text-sm font-semibold text-white">
                {user?.name || 'User'}
              </span>
              <span className="text-xs text-muted">{user?.email}</span>
            </div>
          </li>

          {/* Membership Badge */}
          {user?.membership && (
            <li className="px-3 py-1">
              <div className="flex items-center gap-2 bg-transparent hover:bg-transparent cursor-default p-0">
                <span className="text-[10px] font-semibold text-accent bg-accent/15 px-2 py-0.5 rounded capitalize">
                  {user.membership.type}
                </span>
                <span className="text-xs text-muted">
                  {user.membership.membershipType}
                </span>
              </div>
            </li>
          )}

          <div className="border-t border-card-border my-2"></div>

          {/* Wallet Address */}
          {user?.wallet && (
            <li>
              <a
                href={`https://solscan.io/account/${user.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted hover:text-white hover:bg-input rounded-lg"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                {user.wallet.slice(0, 4)}...{user.wallet.slice(-4)}
              </a>
            </li>
          )}

          <div className="border-t border-card-border my-2"></div>

          {/* Logout */}
          <li>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign Out
            </button>
          </li>
        </ul>
      </div>
    </header>
  )
}
