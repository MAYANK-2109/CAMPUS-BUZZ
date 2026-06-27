/**
 * src/components/CabTracker.jsx
 * Live cab location sharing for #cabsplit post chat rooms.
 * - Author shares GPS via socket every 4s
 * - Riders see live marker on Leaflet/OpenStreetMap (no API key)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, WifiOff } from 'lucide-react';

const ensureLeafletCSS = () => {
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
};

const CabTracker = ({ postId, isAuthor, socket }) => {
  const [sharing, setSharing] = useState(false);
  const [riderLocation, setRiderLocation] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [leafletReady, setLeafletReady] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const intervalRef = useRef(null);
  const LRef = useRef(null);

  useEffect(() => {
    ensureLeafletCSS();
    import('leaflet').then(mod => {
      LRef.current = mod.default || mod;
      setLeafletReady(true);
    }).catch(() => setGeoError('Failed to load map library.'));
  }, []);

  useEffect(() => {
    if (!socket || !postId) return;
    const handler = (payload) => {
      if (payload.postId !== postId) return;
      setRiderLocation(payload);
      setExpanded(true);
    };
    socket.on('cabLocationUpdate', handler);
    return () => socket.off('cabLocationUpdate', handler);
  }, [socket, postId]);

  useEffect(() => {
    if (!leafletReady || !expanded || !mapContainerRef.current) return;
    const L = LRef.current;
    const loc = riderLocation;
    const center = loc ? [loc.lat, loc.lng] : [21.2514, 81.6296];

    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapContainerRef.current, { center, zoom: loc ? 15 : 12 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
      }).addTo(leafletMapRef.current);
    }

    if (loc) {
      const pos = [loc.lat, loc.lng];
      const icon = L.divIcon({ html: '<div style="font-size:28px">🚕</div>', className: '', iconSize: [32, 32], iconAnchor: [16, 28] });
      const age = Math.round((Date.now() - loc.ts) / 1000);
      const popup = '<b>' + (loc.sharedBy || 'Driver') + '</b><br>Updated ' + (age < 5 ? 'just now' : age + 's ago');
      if (markerRef.current) {
        markerRef.current.setLatLng(pos).setPopupContent(popup);
      } else {
        markerRef.current = L.marker(pos, { icon }).addTo(leafletMapRef.current).bindPopup(popup).openPopup();
      }
      leafletMapRef.current.setView(pos, 15, { animate: true });
    }
    setTimeout(() => leafletMapRef.current?.invalidateSize(), 250);
  }, [leafletReady, expanded, riderLocation]);

  const stopSharing = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setSharing(false);
  }, []);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) { setGeoError('Geolocation not supported.'); return; }
    setGeoError('');
    const emit = (pos) => {
      if (socket && postId) socket.emit('cabLocation', { postId, lat: pos.coords.latitude, lng: pos.coords.longitude });
    };
    const onErr = (e) => { setGeoError('GPS error: ' + e.message); stopSharing(); };
    navigator.geolocation.getCurrentPosition(emit, onErr, { enableHighAccuracy: true });
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(emit, onErr, { enableHighAccuracy: true });
    }, 4000);
    setSharing(true);
  }, [socket, postId, stopSharing]);

  useEffect(() => () => stopSharing(), [stopSharing]);

  const ageLabel = riderLocation
    ? (Date.now() - riderLocation.ts < 6000 ? 'just now' : Math.round((Date.now() - riderLocation.ts) / 1000) + 's ago')
    : null;

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.18)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
        <MapPin size={14} color="#57f287" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#57f287', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
          Live Cab Tracker
        </span>
        {isAuthor ? (
          sharing ? (
            <button onClick={stopSharing} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(237,66,69,0.15)', border: '1px solid rgba(237,66,69,0.35)', color: '#ed4245', cursor: 'pointer' }}>
              Stop Sharing
            </button>
          ) : (
            <button onClick={startSharing} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(87,242,135,0.12)', border: '1px solid rgba(87,242,135,0.28)', color: '#57f287', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Navigation size={11} /> Share My Location
            </button>
          )
        ) : (
          riderLocation
            ? <span style={{ fontSize: 11, color: '#57f287', fontWeight: 600 }}>● Live · {ageLabel}</span>
            : <span style={{ fontSize: 11, color: '#72767d' }}>Waiting for driver…</span>
        )}
        <button onClick={() => setExpanded(v => !v)} style={{ fontSize: 10, color: '#72767d', background: 'none', border: 'none', cursor: 'pointer' }}>
          {expanded ? '▲ Hide' : '▼ Map'}
        </button>
      </div>
      {isAuthor && sharing && (
        <div style={{ padding: '0 14px 6px', fontSize: 11, color: '#57f287' }}>
          📡 Broadcasting your live location to all riders…
        </div>
      )}
      {geoError && (
        <div style={{ padding: '0 14px 6px', fontSize: 11, color: '#ed4245', display: 'flex', gap: 4, alignItems: 'center' }}>
          <WifiOff size={11} /> {geoError}
        </div>
      )}
      {expanded && (
        <>
          <div ref={mapContainerRef} style={{ height: 220, margin: '0 14px 10px', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: '#1e2124' }} />
          {!riderLocation && !isAuthor && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#72767d', padding: '0 14px 8px' }}>
              🚕 Map will appear once the driver starts sharing their location.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default CabTracker;
