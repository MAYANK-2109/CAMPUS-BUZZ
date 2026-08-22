/**
 * src/pages/ResourcesPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus Resources hub — single destination for Chat, Calendar, Complaints
 * and Library. Gentle warm palette with clean, responsive cards and an
 * institutional NITRR footer.
 */

import React, { useState } from 'react';
import { useNavigate }  from 'react-router-dom';
import {
  MessageSquare, Calendar, ShieldAlert, BookOpen,
  ArrowRight, MapPin, Award, Users, ExternalLink, Sparkles,
} from 'lucide-react';

/* ── Resource card definitions ──────────────────────────────────────────── */
const RESOURCES = [
  {
    id: 'chat',
    label: 'Chat Hub',
    subtitle: 'Real-time student & group messaging',
    Icon: MessageSquare,
    to: '/chat',
    iconBg: 'bg-blue-600 text-white',
    cardBorder: 'hover:border-blue-300',
    cardGlow: 'hover:shadow-blue-100/80',
    accentBg: 'from-blue-50/80 to-indigo-50/40',
    badge: 'Live',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
    dotColor: 'bg-blue-500',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    subtitle: 'Academic schedules & club events',
    Icon: Calendar,
    to: '/calendar',
    iconBg: 'bg-emerald-600 text-white',
    cardBorder: 'hover:border-emerald-300',
    cardGlow: 'hover:shadow-emerald-100/80',
    accentBg: 'from-emerald-50/80 to-teal-50/40',
    badge: 'Events',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  {
    id: 'complaints',
    label: 'Complaints',
    subtitle: 'Lodge & track campus grievances',
    Icon: ShieldAlert,
    to: '/complaints',
    iconBg: 'bg-amber-600 text-white',
    cardBorder: 'hover:border-amber-300',
    cardGlow: 'hover:shadow-amber-100/80',
    accentBg: 'from-amber-50/80 to-orange-50/40',
    badge: 'Portal',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  {
    id: 'library',
    label: 'Library',
    subtitle: 'Floor map & live seat reservation',
    Icon: BookOpen,
    to: '/library',
    iconBg: 'bg-purple-600 text-white',
    cardBorder: 'hover:border-purple-300',
    cardGlow: 'hover:shadow-purple-100/80',
    accentBg: 'from-purple-50/80 to-violet-50/40',
    badge: 'Seats',
    badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
    dotColor: 'bg-purple-500',
  },
];

/* ── Stats shown on the info footer ─────────────────────────────────────── */
const STATS = [
  { Icon: Users,  label: 'Students',  value: '6,500+' },
  { Icon: Award,  label: 'Rank',      value: 'NIRF #65' },
  { Icon: MapPin, label: 'Location',  value: 'Raipur, CG' },
];

export default function ResourcesPage() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);
  const [clicked, setClicked] = useState(null);

  const handleClick = (resource) => {
    setClicked(resource.id);
    setTimeout(() => {
      setClicked(null);
      navigate(resource.to);
    }, 150);
  };

  return (
    <div
      className="relative min-h-screen w-full flex flex-col transition-colors duration-300"
      style={{
        background: 'linear-gradient(145deg, #fdfbf7 0%, #f9f5ed 45%, #f4ede2 100%)',
      }}
    >
      {/* ── Subtle warm ambient shapes ───────────────────────────────────── */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-200/25 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-1/3 left-0 w-80 h-80 bg-orange-100/30 rounded-full blur-3xl pointer-events-none -ml-20" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-100/20 rounded-full blur-3xl pointer-events-none" />

      {/* ── Content wrapper ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <div className="px-6 pt-10 pb-4 text-center max-w-xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100/80 border border-amber-200/90 text-amber-900 text-xs font-semibold tracking-wider uppercase mb-3.5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Campus Resources
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 tracking-tight leading-tight">
            Everything you need,{' '}
            <span className="bg-gradient-to-r from-amber-700 via-orange-600 to-amber-800 bg-clip-text text-transparent">
              in one place.
            </span>
          </h1>
          <p className="mt-2.5 text-stone-600 text-sm max-w-md mx-auto leading-relaxed">
            Quick access to official services, scheduling tools, grievances and study spaces.
          </p>
        </div>

        {/* ── Resource cards grid ─────────────────────────────────────────── */}
        <div className="flex-1 px-4 sm:px-6 py-6">
          <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {RESOURCES.map((res) => {
              const isHovered = hovered === res.id;
              const isClicked = clicked === res.id;
              return (
                <button
                  key={res.id}
                  onMouseEnter={() => setHovered(res.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleClick(res)}
                  className={`
                    group relative flex flex-col justify-between
                    rounded-2xl p-5 sm:p-6
                    text-left
                    border border-stone-200/90 bg-white/90 backdrop-blur-sm
                    transition-all duration-200 ease-out
                    shadow-sm hover:shadow-xl ${res.cardGlow} ${res.cardBorder}
                    ${isHovered ? 'scale-[1.02] bg-white' : ''}
                    ${isClicked ? 'scale-95' : ''}
                    min-h-[170px]
                    cursor-pointer select-none
                  `}
                  style={{
                    transform: isClicked ? 'scale(0.96)' : isHovered ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {/* Subtle hover gradient wash */}
                  <div
                    className={`
                      absolute inset-0 bg-gradient-to-br ${res.accentBg} rounded-2xl
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
                    `}
                  />

                  {/* Top row: icon + badge */}
                  <div className="relative z-10 flex items-start justify-between mb-3.5">
                    <div
                      className={`
                        w-12 h-12 rounded-xl ${res.iconBg}
                        flex items-center justify-center
                        shadow-md shadow-stone-200/80 transition-transform duration-300
                        ${isHovered ? 'scale-105 rotate-1' : ''}
                      `}
                    >
                      <res.Icon className="w-6 h-6" strokeWidth={2.2} />
                    </div>
                    <span
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                        text-[11px] font-semibold tracking-wide border ${res.badgeClass}
                      `}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${res.dotColor} animate-pulse`} />
                      {res.badge}
                    </span>
                  </div>

                  {/* Label + subtitle */}
                  <div className="relative z-10 flex-1">
                    <h3 className="text-stone-900 font-bold text-lg leading-snug group-hover:text-stone-950">
                      {res.label}
                    </h3>
                    <p className="text-stone-500 text-xs mt-1 leading-relaxed">
                      {res.subtitle}
                    </p>
                  </div>

                  {/* Bottom action row */}
                  <div className="relative z-10 mt-4 flex items-center justify-between pt-3 border-t border-stone-100">
                    <span className="text-xs font-semibold text-stone-500 group-hover:text-stone-800 transition-colors">
                      Open feature
                    </span>
                    <div className="w-7 h-7 rounded-full bg-stone-100 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-all duration-200">
                      <ArrowRight
                        className={`w-3.5 h-3.5 text-stone-600 group-hover:text-white transition-transform duration-200 ${
                          isHovered ? 'translate-x-0.5' : ''
                        }`}
                        strokeWidth={2.5}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── College info footer ─────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 pb-28 md:pb-10 pt-2">
          <div className="max-w-2xl mx-auto">
            {/* Divider with label */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-stone-300/70" />
              <span className="text-stone-400 text-xs font-bold tracking-widest uppercase">
                About NITRR
              </span>
              <div className="flex-1 h-px bg-stone-300/70" />
            </div>

            {/* Warm Info Card */}
            <div className="rounded-2xl border border-stone-200/90 bg-white/85 backdrop-blur-sm px-5 py-5 sm:px-6 shadow-sm">
              {/* Institute name + emblem */}
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center flex-shrink-0 shadow-md text-white">
                  <Award className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-stone-900 font-bold text-sm leading-tight">
                    National Institute of Technology Raipur
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5">Est. 1956 · Institute of National Importance</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-stone-600 text-xs leading-relaxed mb-4">
                NIT Raipur is a premier technical institution in India, offering undergraduate,
                postgraduate, and doctoral programs across engineering, architecture, sciences,
                and management. A vibrant center of learning, research, and holistic student life.
              </p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2.5">
                {STATS.map(({ Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 bg-stone-50 rounded-xl py-2.5 px-2 border border-stone-200/80"
                  >
                    <Icon className="w-3.5 h-3.5 text-amber-700" strokeWidth={2} />
                    <span className="text-stone-900 font-bold text-sm leading-none">{value}</span>
                    <span className="text-stone-500 text-[10px] uppercase font-semibold tracking-wide">{label}</span>
                  </div>
                ))}
              </div>

              {/* Official website link */}
              <a
                href="https://nitrr.ac.in"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-amber-800 transition-colors duration-200"
              >
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                nitrr.ac.in
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

