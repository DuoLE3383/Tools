// src/components/NavBar.jsx
// Shared unified navigation bar for all pages

import { useCallback, useState, useRef, useEffect } from "react";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "🏠" },
  { path: "/nicehash", label: "NiceHash", icon: "⚡" },
  { path: "/orders", label: "Orders", icon: "📋" },
  { path: "/mrr", label: "MRR", icon: "⛏️" },
  { path: "/miner", label: "Miner", icon: "📊" },
  { path: "/mining", label: "Opportunities", icon: "💡" },
];

function navigate(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export default function NavBar({ currentPath, onNavigateHome }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  // Close mobile nav on outside click
  useEffect(() => {
    function handleClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    }
    if (mobileOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [mobileOpen]);

  const handleNav = useCallback((path) => {
    setMobileOpen(false);
    navigate(path);
  }, []);

  return (
    <nav className="unified-nav" ref={navRef}>
      <div className="unified-nav-inner">
        {/* Brand / Logo */}
        <a
          className="unified-nav-brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleNav("/");
          }}
        >
          <span className="unified-nav-logo">⚡</span>
          <span className="unified-nav-title">Mining Tool</span>
        </a>

        {/* Desktop links */}
        <div className="unified-nav-links">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.path ||
              (item.path !== "/" && currentPath.startsWith(item.path));
            return (
              <a
                key={item.path}
                href={item.path}
                className={`unified-nav-link ${isActive ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
              >
                <span className="unified-nav-icon">{item.icon}</span>
                <span className="unified-nav-label">{item.label}</span>
              </a>
            );
          })}
        </div>

        {/* Mobile toggle */}
        <button
          className="unified-nav-toggle"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          <span className={`hamburger ${mobileOpen ? "open" : ""}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="unified-nav-mobile">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.path ||
              (item.path !== "/" && currentPath.startsWith(item.path));
            return (
              <a
                key={item.path}
                href={item.path}
                className={`unified-nav-mobile-link ${isActive ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
              >
                <span className="unified-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {isActive && <span className="unified-nav-active-dot">●</span>}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
