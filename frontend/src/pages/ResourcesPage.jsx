/**
 * src/pages/ResourcesPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Campus Resources hub — single destination for Chat, Calendar, Complaints
 * and Library. Gentle warm palette with clean, responsive cards and an
 * institutional NITRR footer and a restrained solid-colour system.
 */

import React, { useState } from 'react';
import { useNavigate }  from 'react-router-dom';
import {
  MessageSquare, Calendar, ShieldAlert, BookOpen, Map,
  ArrowRight, MapPin, Award, Users, ExternalLink, Sparkles,
} from 'lucide-react';
import FindBot from '../components/FindBot';

/* ── Resource card definitions ──────────────────────────────────────────── */
const RESOURCES = [
  {
    id: 'chat',
    label: 'Chat Hub',
    subtitle: 'Real-time student & group messaging',
    Icon: MessageSquare,
    to: '/chat',
    iconBg: 'bg-[#4c5d66] text-white',
    cardBorder: 'hover:border-slate-300',
    hoverBg: 'bg-slate-50/80',
    badge: 'Live',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotColor: 'bg-slate-500',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    subtitle: 'Academic schedules & club events',
    Icon: Calendar,
    to: '/calendar',
    iconBg: 'bg-[#596b60] text-white',
    cardBorder: 'hover:border-stone-300',
    hoverBg: 'bg-stone-50/80',
    badge: 'Events',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-[#596b60]',
  },
  {
    id: 'complaints',
    label: 'Complaints',
    subtitle: 'Lodge & track campus grievances',
    Icon: ShieldAlert,
    to: '/complaints',
    iconBg: 'bg-[#786856] text-white',
    cardBorder: 'hover:border-stone-300',
    hoverBg: 'bg-[#f6f3ee]',
    badge: 'Portal',
    badgeClass: 'bg-[#f1ede7] text-stone-700 border-stone-200',
    dotColor: 'bg-[#786856]',
  },
  {
    id: 'map',
    label: 'Indoor Map',
    subtitle: 'Floor-wise rooms & shortest-path navigation',
    Icon: Map,
    to: '/map',
    iconBg: 'bg-[#50646a] text-white',
    cardBorder: 'hover:border-slate-300',
    hoverBg: 'bg-[#f1f4f4]',
    badge: 'Navigate',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotColor: 'bg-[#50646a]',
  },
  {
    id: 'library',
    label: 'Library',
    subtitle: 'Floor map & live seat reservation',
    Icon: BookOpen,
    to: '/library',
    iconBg: 'bg-[#655f68] text-white',
    cardBorder: 'hover:border-zinc-300',
    hoverBg: 'bg-zinc-50/80',
    badge: 'Seats',
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    dotColor: 'bg-[#655f68]',
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

  // overflow-x-hidden clips the decorative blobs below: they sit past the
  // container edge (right-0 with -mr-20), which otherwise widens the page
  // beyond the viewport. The layout then scrolls sideways, shifting content
  // and leaving a blank strip down the side on phones.
  return (
    <div
      className="relative min-h-screen w-full flex flex-col transition-colors duration-300 overflow-x-hidden"
      style={{
        background: '#f4f3ef',
      }}
    >
      {/* ── Content wrapper ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen max-w-2xl mx-auto w-full px-4 sm:px-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="pt-8 pb-3 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100/80 border border-amber-200/90 text-amber-900 text-xs font-semibold tracking-wider uppercase mb-2.5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Campus Hub
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight leading-tight">
            Resources &amp; Services
          </h1>
        </div>

        {/* ── TOP: NIT Raipur Description Box ─────────────────────────────── */}
        <div className="my-3">
          <div className="rounded-2xl border border-stone-200/90 bg-white/90 backdrop-blur-sm p-5 sm:p-6 shadow-sm">
            {/* Institute name + emblem */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#786856] flex items-center justify-center flex-shrink-0 shadow-sm text-white">
                  <Award className="w-6 h-6" strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-stone-900 font-bold text-base leading-tight">
                    National Institute of Technology Raipur
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5">Est. 1956 · Institute of National Importance</p>
                </div>
              </div>

              {/* Official website link */}
              <a
                href="https://nitrr.ac.in"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/60 transition-colors"
                title="Open nitrr.ac.in"
              >
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                nitrr.ac.in
              </a>
            </div>

            {/* Description */}
            <p className="text-stone-600 text-xs sm:text-sm leading-relaxed mb-4">
              NIT Raipur is a premier technical institution offering undergraduate,
              postgraduate, and doctoral programs across engineering, architecture, sciences,
              and management. A vibrant center of research, innovation, and holistic student life.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {STATS.map(({ Icon, label, value }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 bg-stone-50/90 rounded-xl py-2 px-2 border border-stone-200/70"
                >
                  <Icon className="w-3.5 h-3.5 text-amber-700" strokeWidth={2} />
                  <span className="text-stone-900 font-bold text-xs sm:text-sm leading-none">{value}</span>
                  <span className="text-stone-500 text-[10px] uppercase font-semibold tracking-wide">{label}</span>
                </div>
              ))}
            </div>

            {/* Mobile-only site link */}
            <a
              href="https://nitrr.ac.in"
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
              Visit official website (nitrr.ac.in)
            </a>
          </div>
        </div>

        {/* ── Section Divider ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-stone-300/70" />
          <span className="text-stone-400 text-xs font-bold tracking-widest uppercase">
            Select an Option
          </span>
          <div className="flex-1 h-px bg-stone-300/70" />
        </div>

        {/* ── AFTER: Resource Cards Grid ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 pb-28 md:pb-12">
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
                  rounded-2xl p-5
                  text-left
                  border border-stone-200/90 bg-white/90 backdrop-blur-sm
                  transition-all duration-200 ease-out
                  shadow-sm hover:shadow-md ${res.cardBorder}
                  ${isHovered ? 'scale-[1.01] bg-white' : ''}
                  ${isClicked ? 'scale-95' : ''}
                  min-h-[155px]
                  cursor-pointer select-none
                `}
                style={{
                  transform: isClicked ? 'scale(0.98)' : isHovered ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                {/* Quiet solid hover wash */}
                <div
                  className={`
                    absolute inset-0 ${res.hoverBg} rounded-2xl
                    opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
                  `}
                />

                {/* Top row: icon + badge */}
                <div className="relative z-10 flex items-start justify-between mb-3">
                  <div
                    className={`
                      w-11 h-11 rounded-xl ${res.iconBg}
                      flex items-center justify-center
                      shadow-sm transition-transform duration-300
                      ${isHovered ? 'scale-[1.03]' : ''}
                    `}
                  >
                    <res.Icon className="w-5 h-5" strokeWidth={2.2} />
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
                  <h3 className="text-stone-900 font-bold text-base sm:text-lg leading-snug group-hover:text-stone-950">
                    {res.label}
                  </h3>
                  <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">
                    {res.subtitle}
                  </p>
                </div>

                {/* Bottom action row */}
                <div className="relative z-10 mt-3.5 flex items-center justify-between pt-2.5 border-t border-stone-100">
                  <span className="text-xs font-semibold text-stone-500 group-hover:text-stone-800 transition-colors">
                    Open {res.label}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-stone-100 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-all duration-200">
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

      {/* Find BOT lives on Resources only. This page is already the "where do I
          go for X" hub, so an assistant that answers in navigation buttons
          belongs beside the cards rather than floating over every screen. */}
      <FindBot />
    </div>
  );
}

