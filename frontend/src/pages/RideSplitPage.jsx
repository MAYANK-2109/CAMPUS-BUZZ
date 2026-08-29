import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bike,
  Car,
  Check,
  Clock3,
  IndianRupee,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Route,
  Search,
  Users,
  X, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import api from '../utils/api';
import ChatRoom from '../Chat/ChatRoom';
import { useAuth } from '../context/AuthContext';

const DESTINATIONS = [
  'Raipur Railway Station',
  'Swami Vivekananda Airport',
  'Magneto The Mall',
  'Ambuja City Centre',
  'Pandri Bus Stand',
  'Telibandha Marine Drive',
  'Jaistambh Chowk',
  'Shankar Nagar',
  'Tatibandh',
  'Bhilai',
];

const VEHICLES = {
  cab:        { label: 'Cab',        Icon: Car },
  auto:       { label: 'Auto',       Icon: Bike },
  shared_cab: { label: 'Shared cab', Icon: Users },
};

const normaliseRide = (ride) => ({
  ...ride,
  seatsFilled: Number(ride.seatsFilled || 1),
  isFull: Boolean(ride.isFull),
  isJoined: Boolean(ride.isJoined),
});

function PostRideModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    destination: '',
    routeStops: '',
    vehicleType: 'cab',
    totalSeats: 4,
    departureTime: '',
    totalFare: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.destination.trim() || !form.departureTime || !form.totalFare) {
      setError('Destination, departure time, and total fare are required.');
      return;
    }

    setLoading(true);
    try {
      const destination = form.destination.trim();
      const notes = form.notes.trim();
      const payload = {
        title: `Ride to ${destination}`,
        description: notes || `Ride from NIT Raipur to ${destination}.`,
        hashtag: '#cabsplit',
        expiresAt: form.departureTime,
        totalFare: Number(form.totalFare),
        ride: {
          from: 'NIT Raipur',
          destination,
          routeStops: form.routeStops
            .split(',')
            .map((stop) => stop.trim())
            .filter(Boolean),
          vehicleType: form.vehicleType,
          totalSeats: Number(form.totalSeats),
          departureTime: form.departureTime,
        },
      };
      await api.post('/posts', payload);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not post this ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Post a new ride"
    >
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Offer a seat</p>
            <h2 className="mt-0.5 text-xl font-black text-slate-950">Post a new ride</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">From</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-3 text-sm font-semibold text-slate-500">
                <MapPin className="h-4 w-4" /> NIT Raipur
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">To</span>
              <input
                name="destination"
                value={form.destination}
                onChange={update}
                list="ride-destination-options"
                className="input-base bg-white"
                placeholder="Railway station, airport…"
                maxLength={120}
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Stops along the route</span>
            <input
              name="routeStops"
              value={form.routeStops}
              onChange={update}
              className="input-base bg-white"
              placeholder="Shankar Nagar, Railway Station (comma separated)"
            />
            <span className="mt-1.5 block text-xs text-slate-400">These stops help students discover rides that pass through their destination.</span>
          </label>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Vehicle</legend>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(VEHICLES).map(([value, { label, Icon }]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, vehicleType: value }))}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold transition ${
                    form.vehicleType === value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" /> {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Departure</span>
              <input
                type="datetime-local"
                name="departureTime"
                value={form.departureTime}
                onChange={update}
                min={new Date().toISOString().slice(0, 16)}
                className="input-base bg-white"
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Total seats</span>
              <select name="totalSeats" value={form.totalSeats} onChange={update} className="input-base bg-white">
                {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} people</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Total fare</span>
            <div className="relative">
              <IndianRupee className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                name="totalFare"
                value={form.totalFare}
                onChange={update}
                className="input-base bg-white pl-10"
                placeholder="450"
                min="1"
                required
              />
            </div>
            {Number(form.totalFare) > 0 && (
              <span className="mt-1.5 block text-sm font-semibold text-emerald-600">
                About ₹{Math.ceil(Number(form.totalFare) / Number(form.totalSeats)).toLocaleString('en-IN')} per person
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Notes</span>
            <textarea
              name="notes"
              value={form.notes}
              onChange={update}
              rows={3}
              maxLength={500}
              className="input-base resize-none bg-white"
              placeholder="Luggage space, pickup landmark, flexibility…"
            />
          </label>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {loading ? 'Posting ride…' : 'Post ride'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RideCard({ ride, onJoin, joining, isOwner, onEnd, ending }) {
  const vehicle = VEHICLES[ride.ride?.vehicleType] || VEHICLES.cab;
  const VehicleIcon = vehicle.Icon;
  const totalSeats = ride.ride?.totalSeats || 4;
  const seatsFilled = Math.min(ride.seatsFilled, totalSeats);
  const farePerPerson = Math.ceil(Number(ride.totalFare || 0) / totalSeats);
  const joinedOrOwner = ride.isJoined;

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <VehicleIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{vehicle.label}</p>
              <h3 className="text-base font-black leading-tight text-slate-950">{ride.ride.destination}</h3>
            </div>
          </div>
          {ride.matchType === 'route' && (
            <span className="flex flex-none items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">
              <Route className="h-3 w-3" /> On your route
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-[18px_1fr] gap-x-3 gap-y-0">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 rounded-full border-[3px] border-slate-900 bg-white" />
            <span className="my-1 h-8 w-px bg-slate-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">From</p>
            <p className="text-sm font-bold text-slate-700">NIT Raipur</p>
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-400">To</p>
              <p className="text-sm font-bold text-slate-950">{ride.ride.destination}</p>
            </div>
          </div>
        </div>

        {ride.ride.routeStops?.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
            <Route className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
            Via {ride.ride.routeStops.join(' · ')}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Clock3 className="h-3.5 w-3.5" /> Departure</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{format(new Date(ride.ride.departureTime), 'EEE, d MMM · h:mm a')}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Users className="h-3.5 w-3.5" /> Seats</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">{seatsFilled}/{totalSeats}</span>
              <span className="flex gap-1">
                {Array.from({ length: totalSeats }, (_, index) => (
                  <span key={index} className={`h-1.5 w-3 rounded-full ${index < seatsFilled ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">₹{Number(ride.totalFare || 0).toLocaleString('en-IN')} total fare</p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-emerald-600">₹{farePerPerson.toLocaleString('en-IN')}<span className="ml-1 text-xs font-bold text-emerald-600/70">/ person</span></p>
          </div>
          <button
            type="button"
            disabled={(ride.isFull && !joinedOrOwner) || joining}
            onClick={() => onJoin(ride)}
            className={`flex min-w-[108px] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              ride.isFull && !joinedOrOwner
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : joinedOrOwner
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-950 text-white shadow-md hover:bg-slate-800'
            }`}
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : joinedOrOwner ? <Check className="h-4 w-4" /> : null}
            {joining ? 'Joining…' : joinedOrOwner ? 'Open chat' : ride.isFull ? 'Full' : 'Join ride'}
          </button>
        </div>
      </div>

      {/* Creator controls. Close and cancel are visually distinct on purpose:
          they look alike but one confirms a ride and the other calls it off,
          and a rider is relying on which one gets pressed. */}
      {isOwner && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 sm:px-6">
          <button
            type="button"
            disabled={Boolean(ending)}
            onClick={() => onEnd(ride, 'close')}
            title="Stop taking riders and send everyone the ride details"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2
                       text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {ending === 'close' ? 'Closing…' : 'Close ride'}
          </button>
          <button
            type="button"
            disabled={Boolean(ending)}
            onClick={() => onEnd(ride, 'cancel')}
            title="Call the ride off and tell everyone who joined"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50
                       px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            {ending === 'cancel' ? 'Cancelling…' : 'Cancel ride'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500 sm:px-6">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-bold text-slate-600">
          {ride.author?.avatarUrl
            ? <img src={ride.author.avatarUrl} alt="" className="h-full w-full object-cover" />
            : ride.author?.displayName?.charAt(0)?.toUpperCase()}
        </div>
        Posted by <span className="font-bold text-slate-700">{ride.author?.displayName || 'Campus Buzz user'}</span>
      </div>
    </article>
  );
}

export default function RideSplitPage() {
  const { user } = useAuth();
  const [destination, setDestination] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [chatRide, setChatRide] = useState(null);
  const [endingId, setEndingId] = useState(null);   // `${rideId}:${action}` while in flight

  const suggestions = useMemo(() => {
    const needle = destination.trim().toLowerCase();
    return needle ? DESTINATIONS.filter((item) => item.toLowerCase().includes(needle)).slice(0, 5) : [];
  }, [destination]);

  const loadRides = useCallback(async (searchDestination = destination) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/rides', {
        params: searchDestination.trim() ? { destination: searchDestination.trim() } : {},
      });
      setRides((data.data || []).map(normaliseRide));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load rides right now.');
    } finally {
      setLoading(false);
    }
  }, [destination]);

  useEffect(() => { loadRides(''); }, []);

  const search = (event) => {
    event?.preventDefault();
    setShowSuggestions(false);
    loadRides(destination);
  };

  /**
   * Ends a ride the current user created.
   *
   * Both outcomes remove the listing, so the confirm text has to say which one
   * the rider will receive — "close" and "cancel" are one word apart and mean
   * opposite things to somebody waiting at the gate.
   */
  const endRide = async (ride, action) => {
    if (endingId) return;

    const where = ride.ride?.destination || 'this destination';
    const prompt = action === 'cancel'
      ? `Cancel the ride to ${where}?\n\n` +
        '• Everyone who joined is told the ride is OFF\n' +
        '• The listing and its chat are removed\n\nThis cannot be undone.'
      : `Close the ride to ${where}?\n\n` +
        '• Everyone who joined gets the full ride details\n' +
        '• The listing stops taking new riders\n' +
        '• The chat stays open so you can coordinate\n\nThis cannot be undone.';

    if (!window.confirm(prompt)) return;

    setEndingId(`${ride._id}:${action}`);
    try {
      const { data } = await api.patch(`/rides/${ride._id}/${action}`);
      setRides((prev) => prev.filter((r) => r._id !== ride._id));
      setChatRide((c) => (c?._id === ride._id && action === 'cancel' ? null : c));
      alert(data.message);
    } catch (err) {
      alert(err.response?.data?.message || `Could not ${action} this ride.`);
    } finally {
      setEndingId(null);
    }
  };

  const joinRide = async (ride) => {
    if (ride.isJoined) {
      setChatRide(ride);
      return;
    }

    setJoiningId(ride._id);
    setError('');
    try {
      const { data } = await api.post(`/rides/${ride._id}/join`);
      const updated = {
        ...ride,
        isJoined: true,
        seatsFilled: data.seatsFilled || ride.seatsFilled + 1,
      };
      setRides((current) => current.map((item) => item._id === ride._id ? updated : item));
      setChatRide(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join this ride.');
      if (err.response?.status === 409) loadRides(destination);
    } finally {
      setJoiningId(null);
    }
  };

  const rideCreated = () => {
    setPosting(false);
    setDestination('');
    loadRides('');
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] px-4 pb-32 pt-5 sm:px-6 sm:pt-8 lg:px-10">
      <datalist id="ride-destination-options">
        {DESTINATIONS.map((item) => <option key={item} value={item} />)}
      </datalist>

      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-8 text-white shadow-xl sm:px-10 sm:py-10">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <Car className="h-3.5 w-3.5" /> Campus rides, shared smarter
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Find your ride.<br /><span className="text-emerald-400">Split the fare.</span></h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">Search rides leaving NIT Raipur and discover direct matches or trips that pass through your destination.</p>
          </div>
        </section>

        <form onSubmit={search} className="relative z-10 mx-auto -mt-5 grid max-w-4xl gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/60 sm:grid-cols-[1fr_auto_1.5fr_auto] sm:items-end sm:p-4">
          <label className="block">
            <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">From</span>
            <span className="flex h-11 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-500"><MapPin className="h-4 w-4" /> NIT Raipur</span>
          </label>
          <ArrowRight className="mb-3 hidden h-5 w-5 text-slate-300 sm:block" />
          <label className="relative block">
            <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Where are you going?</span>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-50">
              <Navigation className="h-4 w-4 text-emerald-500" />
              <input
                value={destination}
                onChange={(event) => { setDestination(event.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                placeholder="Airport, railway station, mall…"
              />
              {destination && <button type="button" onClick={() => { setDestination(''); setShowSuggestions(false); loadRides(''); }} aria-label="Clear destination"><X className="h-4 w-4 text-slate-400" /></button>}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                {suggestions.map((item) => (
                  <button key={item} type="button" onClick={() => { setDestination(item); setShowSuggestions(false); loadRides(item); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> {item}
                  </button>
                ))}
              </div>
            )}
          </label>
          <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-400">
            <Search className="h-4 w-4" /> Find rides
          </button>
        </form>

        <div className="mt-9 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">{destination.trim() ? 'Best matches' : 'Leaving soon'}</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{destination.trim() ? `Rides near “${destination.trim()}”` : 'Upcoming rides'}</h2>
          </div>
          {!loading && <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm">{rides.length} {rides.length === 1 ? 'ride' : 'rides'}</span>}
        </div>

        {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /></div>
        ) : rides.length > 0 ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {rides.map((ride) => (
              <RideCard
                key={ride._id}
                ride={ride}
                onJoin={joinRide}
                joining={joiningId === ride._id}
                isOwner={(ride.author?._id || ride.author) === user?._id}
                onEnd={endRide}
                ending={endingId?.startsWith(`${ride._id}:`) ? endingId.split(':')[1] : null}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><Route className="h-6 w-6 text-slate-400" /></div>
            <h3 className="mt-4 text-lg font-black text-slate-900">No matching rides yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Try a nearby stop, clear the destination to browse all upcoming rides, or post a ride for others to join.</p>
          </div>
        )}
      </div>

      <button type="button" onClick={() => setPosting(true)} className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3.5 text-sm font-black text-white shadow-2xl transition hover:-translate-y-0.5 hover:bg-slate-800 md:bottom-8 md:right-8">
        <Plus className="h-5 w-5" /> Post a new ride
      </button>

      {posting && <PostRideModal onClose={() => setPosting(false)} onCreated={rideCreated} />}
      {chatRide && (
        <ChatRoom
          postId={chatRide._id}
          postTitle={chatRide.title}
          hashtag="#cabsplit"
          isAuthor={chatRide.author?._id === user?._id}
          onClose={() => setChatRide(null)}
          onRoomClosed={() => loadRides(destination)}
        />
      )}
    </div>
  );
}
