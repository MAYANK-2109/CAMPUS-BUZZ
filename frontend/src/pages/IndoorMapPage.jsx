import React, { useMemo, useState } from 'react';
import {
  Accessibility, ArrowLeftRight, ChevronDown, DoorOpen, LocateFixed,
  MapPin, Navigation, RotateCcw, RotateCw, Search, Sparkles, X,
} from 'lucide-react';

const room = (id, label, x, y, w, h, icon = 'room', kind = 'room') => ({ id, label, x, y, w, h, icon, kind });

export const FLOORS = {
  ground: {
    name: 'Ground', level: 0, subtitle: 'Gardens, MakerSpace & E-Hall', viewBox: '0 0 1080 805', width: 1080, height: 805, overlayWidth: 1080, overlayHeight: 805, image: '/maps/ground.jpg', transition: { x: 650, y: 730, label: 'Central stairs' },
    zones: [
      room('garden-a','Garden',105,105,535,145,'garden','landmark'), room('makerspace','MakerSpace',740,105,235,140,'maker','landmark'),
      room('g41','G41',718,245,55,57), room('g4','G4',660,320,58,120,'class'), room('g2','G2',660,440,58,55), room('g55','G55',995,443,58,70),
      room('garden-b','Garden',165,320,215,165,'garden','landmark'), room('garden-c','Garden',430,320,210,165,'garden','landmark'), room('garden-d','Garden',718,320,258,165,'garden','landmark'),
      room('garden-e','Garden',400,548,240,124,'garden','landmark'), room('ehall','E - HALL',660,548,58,155,'hall','landmark'), room('stage','Stage',718,548,258,155,'stage','landmark'),
      room('g37','G37',330,673,55,40), room('g1a','G1',465,675,50,38), room('g1b','G1',520,675,50,38), room('g1c','G1',575,675,50,38),
      room('parking','Parking',802,705,228,42,'parking','landmark'), room('g-wc','WC',62,655,40,70,'wc','facility'), room('g-exit','Main Entrance',675,705,100,70,'exit','facility'),
    ],
    corridors: [[85,290,1015,290],[105,520,1015,520],[105,730,1000,730],[105,290,105,730],[390,290,390,730],[650,290,650,730],[990,290,990,730]],
  },
  first: {
    name: 'First', level: 1, subtitle: 'Faculty rooms, halls & studios', viewBox: '0 0 1080 693', width: 1080, height: 693, overlayWidth: 1080, overlayHeight: 693, image: '/maps/first.jpg', transition: { x: 680, y: 620, label: 'Main stairs' },
    zones: [
      room('garden-1a','Garden',96,28,526,131,'garden','landmark'), room('garden-1b','Garden',692,28,315,131,'garden','landmark'),
      room('fn4','FN4',642,28,49,33), room('fn3','FN3',642,61,49,33), room('fn2','FN2',642,94,49,32), room('fn1','FN1',642,126,49,33),
      room('f35','F35',202,159,53,52), room('f36','F36',255,159,53,52), room('f37','F37',308,159,52,52), room('f38','F38',360,159,89,52), room('f39','F39',449,159,84,52), room('f40','F40',533,159,89,52),
      room('f42','F42',692,159,48,52), room('f43a','F43A',740,159,37,52), room('f43b','F43B',777,159,37,52), room('f44','F44',814,159,45,52), room('f45','F45',859,159,44,52), room('f46','F46',903,159,48,52), room('f47a','F47A',951,159,56,52),
      room('garden-1c','Garden',136,230,242,151,'garden','landmark'), room('garden-1d','Garden',449,230,173,151,'garden','landmark'), room('garden-1e','Garden',693,230,242,151,'garden','landmark'),
      room('f3','F3',80,355,56,54), room('f2','F2',80,409,56,55), room('f5','F5',642,230,51,86), room('f52','F52',955,230,52,49), room('f53','F53',955,279,52,49), room('f54','F54',955,328,52,49),
      room('f4','F4',479,381,53,43), room('f6','F6',584,381,38,43), room('f24','F24',803,381,53,43), room('f26','F26',870,381,53,43),
      room('f1','F1',136,442,42,43), room('f13','F13',136,485,42,78), room('studio-f','Studio',178,442,200,121,'studio','landmark'),
      room('garden-1f','Garden',449,442,173,121,'garden','landmark'), room('cv-hall','C. V. Raman Hall',642,442,51,137,'hall','landmark'), room('stage-f','Stage',693,442,242,137,'stage','landmark'),
      room('f-wc','WC',80,547,56,69,'wc','facility'), room('f-stair','Stairs',658,579,89,60,'stairs','facility'),
    ],
    corridors: [[80,220,1010,220],[80,430,1010,430],[80,620,1010,620],[120,200,120,620],[390,200,390,620],[630,200,630,620],[945,200,945,620]],
  },
  second: {
    name: 'Second', level: 2, subtitle: 'Seminar rooms, library & halls', viewBox: '0 0 1080 1011', width: 1080, height: 1011, overlayWidth: 1080, overlayHeight: 1011, image: '/maps/second.jpg', transition: { x: 548, y: 945, label: 'Main stairs' },
    zones: [
      room('garden-2a','Garden',38,100,453,205,'garden','landmark'), room('sn4','SN4',519,100,62,52), room('sn3','SN3',519,152,62,51), room('sn2','SN2',519,203,62,52), room('garden-2b','Garden',581,100,337,205,'garden','landmark'),
      room('it1','IT1',82,305,58,74), room('it2','IT2',140,305,59,74), room('s42','S42',581,305,59,74), room('s42a','S42A',640,305,46,74),
      room('s14','S14',82,404,53,104), room('s13','S13',82,508,53,103), room('garden-2c','Garden',135,404,143,176,'garden','landmark'),
      room('s16','S16',166,580,37,70), room('s17','S17',203,580,37,70), room('s18','S18',240,580,38,70),
      room('garden-2d','Garden',353,404,138,176,'garden','landmark'), room('d4','D4',353,580,46,70), room('d3','D3',399,580,92,70),
      room('s4','S4',519,404,60,104), room('garden-2e','Garden',579,404,343,176,'garden','landmark'), room('s19','S19',579,580,62,70), room('s22','S22',790,580,55,70),
      room('s11','S11',82,674,53,111), room('studio-s','Studio',135,674,143,177,'studio','landmark'),
      room('library-north','Library',299,674,53,177,'library','landmark'), room('garden-2f','Garden',352,674,139,178,'garden','landmark'), room('library-south','Library',331,852,160,89,'library','landmark'),
      room('vs-hall','V. S. Hall',519,674,60,105,'hall','landmark'), room('d1','D1',519,779,60,53), room('stage-s','Stage',579,674,343,199,'stage','landmark'),
      room('s-wc','WC',25,844,57,80,'wc','facility'), room('s-stair','Stairs',519,923,58,78,'stairs','facility'),
    ],
    corridors: [[55,392,950,392],[55,660,950,660],[55,945,950,945],[60,300,60,945],[290,300,290,945],[505,300,505,945],[940,300,940,945]],
  },
  backside: {
    name: 'Backside', level: 0, subtitle: 'Main building rear block', viewBox: '0 0 1080 801', width: 1080, height: 801, overlayWidth: 1080, overlayHeight: 801, image: '/maps/backside.jpg', transition: { x: 790, y: 490, label: 'Main Building connection' },
    zones: [
      ...['B-09','B-08','B-07','B-06','B-05','B-04','B-03','B-02','B-01'].map((label,i) => room(`b${9-i}`,label,236+i*66.5,128,66.5,79,'class')),
      room('back-wc','WC',834,128,49,39,'wc','facility'), room('yoga','Yoga Hall',883,128,55,146,'hall','landmark'), room('back-stair','Stairs',938,128,54,205,'stairs','facility'), room('apj','APJ Hall',883,333,55,117,'hall','landmark'),
      room('garden-b1','Garden',173,238,263,266,'garden','landmark'), room('garden-b2','Garden',462,237,371,267,'garden','landmark'),
      room('vachan','Vachan',98,505,66,131,'hall','landmark'), room('main-building','Main Building',164,505,831,162,'building','landmark'),
    ],
    corridors: [[110,220,950,220],[110,490,950,490],[110,680,1000,680],[145,200,145,680],[850,200,850,680]],
  },
};

export function buildGraph(segments, step = 20) {
  const pts = new Map();
  const key = (x,y) => `${Math.round(x)},${Math.round(y)}`;
  const add = (x,y) => { const k=key(x,y); if(!pts.has(k)) pts.set(k,{ id:k,x:+k.split(',')[0],y:+k.split(',')[1],edges:[] }); return pts.get(k); };
  const between=(value,a,b)=>value>=Math.min(a,b)&&value<=Math.max(a,b);
  const intersection=(a,b)=>{
    const ah=a[1]===a[3], av=a[0]===a[2], bh=b[1]===b[3], bv=b[0]===b[2];
    if(ah&&bv&&between(b[0],a[0],a[2])&&between(a[1],b[1],b[3]))return{x:b[0],y:a[1]};
    if(av&&bh&&between(a[0],b[0],b[2])&&between(b[1],a[1],a[3]))return{x:a[0],y:b[1]};
    return null;
  };
  segments.forEach((segment,index) => {
    const [x1,y1,x2,y2]=segment, len=Math.hypot(x2-x1,y2-y1), count=Math.max(1,Math.ceil(len/step));
    const samples=Array.from({length:count+1},(_,i)=>({x:x1+(x2-x1)*i/count,y:y1+(y2-y1)*i/count}));
    segments.forEach((other,otherIndex)=>{if(index!==otherIndex){const point=intersection(segment,other);if(point)samples.push(point);}});
    samples.sort((a,b)=>Math.hypot(a.x-x1,a.y-y1)-Math.hypot(b.x-x1,b.y-y1));
    let prev;
    samples.forEach(point=>{const n=add(point.x,point.y);if(prev&&prev.id!==n.id){if(!prev.edges.includes(n.id))prev.edges.push(n.id);if(!n.edges.includes(prev.id))n.edges.push(prev.id);}prev=n;});
  });
  const nodes=[...pts.values()];
  return { nodes, map:new Map(nodes.map(n=>[n.id,n])) };
}

export function aStar(graph, startPoint, endPoint) {
  const nearest=p=>graph.nodes.reduce((best,n)=>Math.hypot(n.x-p.x,n.y-p.y)<Math.hypot(best.x-p.x,best.y-p.y)?n:best,graph.nodes[0]);
  const start=nearest(startPoint), goal=nearest(endPoint), open=new Set([start.id]), came=new Map(), g=new Map([[start.id,0]]), f=new Map([[start.id,Math.hypot(start.x-goal.x,start.y-goal.y)]]);
  while(open.size){ let current=[...open].reduce((a,b)=>(f.get(a)??Infinity)<(f.get(b)??Infinity)?a:b); if(current===goal.id){ const ids=[current]; while(came.has(current)){current=came.get(current);ids.unshift(current);} return [startPoint,...ids.map(id=>graph.map.get(id)),endPoint]; }
    open.delete(current); const c=graph.map.get(current); c.edges.forEach(id=>{const n=graph.map.get(id),tent=(g.get(current)??Infinity)+Math.hypot(c.x-n.x,c.y-n.y);if(tent<(g.get(id)??Infinity)){came.set(id,current);g.set(id,tent);f.set(id,tent+Math.hypot(n.x-goal.x,n.y-goal.y));open.add(id);}});
  } return [];
}

const selectable = z => ['room','landmark','facility'].includes(z.kind);

const FLOOR_STACK = ['ground', 'first', 'second'];

export function floorSequence(from, to) {
  if (from === to) return [from];
  if (from === 'backside') return ['backside', ...floorSequence('ground', to)];
  if (to === 'backside') return [...floorSequence(from, 'ground'), 'backside'];
  const a = FLOOR_STACK.indexOf(from), b = FLOOR_STACK.indexOf(to);
  const slice = FLOOR_STACK.slice(Math.min(a,b), Math.max(a,b)+1);
  return a <= b ? slice : slice.reverse();
}

const centerOf = zone => ({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });
const pathLength = path => path.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-path[i].x,p.y-path[i].y), 0);

function FloorSvg({ floor, start, end, route, transfer, onZoneClick, rotation, zoom }) {
  const overlayWidth = floor.overlayWidth || 1000;
  const overlayHeight = floor.overlayHeight || 650;
  const overlayScaleX = floor.width / overlayWidth;
  const overlayScaleY = floor.height / overlayHeight;
  return (
    <div className="imap-canvas" aria-label={`${floor.name} floor plan`} style={{ aspectRatio: `${floor.width}/${floor.height}` }}>
      <svg viewBox={floor.viewBox} role="img" style={{ transform:`scale(${zoom}) rotate(${rotation}deg)` }}>
        <title>{floor.name} floor plan</title>
        <desc>Original floor-plan image supplied by the user with a separate transparent navigation overlay.</desc>
        <defs>
          <filter id="pathGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <image href={floor.image} x="0" y="0" width={floor.width} height={floor.height} preserveAspectRatio="xMidYMid meet" />
        <g transform={`scale(${overlayScaleX} ${overlayScaleY})`}>
          {floor.zones.slice().sort((a,b)=>(b.w*b.h)-(a.w*a.h)).map(z => {
            const active=start?.id===z.id?'start':end?.id===z.id?'end':'';
            return <g key={z.id} className={`imap-zone imap-zone--hotspot ${active&&`imap-zone--${active}`}`} onClick={()=>selectable(z)&&onZoneClick(z)} role={selectable(z)?'button':undefined} tabIndex={selectable(z)?0:undefined} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selectable(z))onZoneClick(z)}}>
              <title>{z.label}</title>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="2"/>
            </g>;
          })}
          {route.length>1&&<polyline points={route.map(p=>`${p.x},${p.y}`).join(' ')} className="imap-route" filter="url(#pathGlow)"/>}
          {transfer&&<g transform={`translate(${transfer.x} ${transfer.y})`} className="imap-transfer"><circle r="16"/><text textAnchor="middle" y="5">⇅</text></g>}
          {start&&<g transform={`translate(${start.x+start.w/2} ${start.y+start.h/2})`} className="imap-pin imap-pin--start"><circle r="14"/><text textAnchor="middle" y="4">A</text></g>}
          {end&&<g transform={`translate(${end.x+end.w/2} ${end.y+end.h/2})`} className="imap-pin imap-pin--end"><circle r="14"/><text textAnchor="middle" y="4">B</text></g>}
        </g>
      </svg>
    </div>
  );
}

export default function IndoorMapPage(){
  const [floorKey,setFloorKey]=useState('ground'), [start,setStart]=useState(null), [end,setEnd]=useState(null), [selecting,setSelecting]=useState('start');
  const [rotation,setRotation]=useState(0), [zoom,setZoom]=useState(1), [query,setQuery]=useState('');
  const floor=FLOORS[floorKey];
  const graphs=useMemo(()=>Object.fromEntries(Object.entries(FLOORS).map(([key,value])=>[key,buildGraph(value.corridors)])),[]);
  const routePlan=useMemo(()=>{
    if(!start||!end) return { routes:{}, floors:[], transfers:0, minutes:0, crossFloor:false };
    if(start.floorKey===end.floorKey){
      const route=aStar(graphs[start.floorKey],centerOf(start),centerOf(end));
      return { routes:{[start.floorKey]:route}, floors:[start.floorKey], transfers:0, minutes:Math.max(1,Math.ceil(pathLength(route)/160)), crossFloor:false };
    }
    const floors=floorSequence(start.floorKey,end.floorKey);
    const startTransition=FLOORS[start.floorKey].transition;
    const endTransition=FLOORS[end.floorKey].transition;
    const firstLeg=aStar(graphs[start.floorKey],centerOf(start),startTransition);
    const lastLeg=aStar(graphs[end.floorKey],endTransition,centerOf(end));
    const routes={ [start.floorKey]:firstLeg, [end.floorKey]:lastLeg };
    return {
      routes, floors, transfers:floors.length-1, crossFloor:true,
      minutes:Math.max(2,Math.ceil((pathLength(firstLeg)+pathLength(lastLeg))/160+(floors.length-1)*.75)),
    };
  },[graphs,start,end]);
  const route=routePlan.routes[floorKey]||[];
  const destinations=floor.zones.filter(selectable).filter(z=>z.label.toLowerCase().includes(query.toLowerCase()));
  const roomOptions=floor.zones.filter(selectable).slice().sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
  const labelCounts=roomOptions.reduce((counts,z)=>({...counts,[z.label]:(counts[z.label]||0)+1}),{});
  const optionLabel=(zone)=>{
    if(labelCounts[zone.label]===1)return zone.label;
    const number=roomOptions.filter(z=>z.label===zone.label).findIndex(z=>z.id===zone.id)+1;
    return `${zone.label} — area ${number}`;
  };
  const changeFloor=k=>{setFloorKey(k);setRotation(0);setZoom(1);setQuery('');};
  const choose=z=>{
    const selected={...z,floorKey};
    if(selecting==='start'){
      setStart(selected);
      if(end?.id===z.id&&end?.floorKey===floorKey)setEnd(null);
      setSelecting('end');
    }else{
      setEnd(selected);
      if(start?.id===z.id&&start?.floorKey===floorKey)setStart(null);
    }
  };
  const reset=()=>{setStart(null);setEnd(null);setSelecting('start');setRotation(0);setZoom(1);};
  const swap=()=>{setStart(end);setEnd(start);};
  const endpointLabel=point=>point?`${FLOORS[point.floorKey].name} · ${point.label}`:'Tap a room';
  const currentTransfer=routePlan.crossFloor&&routePlan.floors.includes(floorKey)?FLOORS[floorKey].transition:null;
  return <div className="imap-page">
    <header className="imap-header">
      <div><span className="imap-kicker"><Sparkles size={13}/> Interactive campus guide</span><h1>Indoor Navigation</h1><p>Choose two places to find the shortest corridor route.</p></div>
      <div className="imap-access"><Accessibility size={17}/><span>Accessible interactive map</span></div>
    </header>
    <div className="imap-layout">
      <aside className="imap-panel">
        <div className="imap-floor-tabs" role="tablist">{Object.entries(FLOORS).map(([k,v])=><button key={k} className={k===floorKey?'active':''} onClick={()=>changeFloor(k)} role="tab" aria-selected={k===floorKey}>{v.name}</button>)}</div>
        <div className="imap-panel-title"><div><small>Now viewing</small><h2>{floor.name} Floor</h2><p>{floor.subtitle}</p></div><ChevronDown size={18}/></div>
        <div className="imap-route-picker">
          <button className={`imap-point ${selecting==='start'?'active':''}`} onClick={()=>setSelecting('start')}><span className="dot dot-a">A</span><span><small>Start</small><strong>{endpointLabel(start)}</strong></span>{start&&<X size={15} onClick={e=>{e.stopPropagation();setStart(null)}}/>}</button>
          <button className="imap-swap" onClick={swap} disabled={!start&&!end} title="Swap start and destination"><ArrowLeftRight size={15}/></button>
          <button className={`imap-point ${selecting==='end'?'active':''}`} onClick={()=>setSelecting('end')}><span className="dot dot-b">B</span><span><small>Destination</small><strong>{endpointLabel(end)}</strong></span>{end&&<X size={15} onClick={e=>{e.stopPropagation();setEnd(null)}}/>}</button>
        </div>
        <label className="imap-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rooms and places"/></label>
        {query&&<div className="imap-results">{destinations.slice(0,8).map(z=><button key={z.id} onClick={()=>{choose(z);setQuery('')}}><MapPin size={14}/><span>{z.label}</span><small>{floor.name}</small></button>)}{!destinations.length&&<p>No matching place on this floor.</p>}</div>}
        <label className="imap-room-select"><span>All mapped areas <b>{roomOptions.length}</b></span><select value="" onChange={e=>{const zone=floor.zones.find(z=>z.id===e.target.value);if(zone)choose(zone)}}><option value="">Choose a room or landmark…</option>{roomOptions.map(z=><option key={z.id} value={z.id}>{optionLabel(z)}</option>)}</select></label>
        <div className="imap-legend"><span><i className="legend-route"/>Route</span><span><i className="legend-room"/>Room</span><span><i className="legend-landmark"/>Landmark</span></div>
        {start&&end&&routePlan.crossFloor&&<div className="imap-floor-route">
          <small>Floor-by-floor route</small>
          <div>{routePlan.floors.map((key,index)=><React.Fragment key={key}><button className={floorKey===key?'active':''} onClick={()=>changeFloor(key)}>{FLOORS[key].name}</button>{index<routePlan.floors.length-1&&<span>→</span>}</React.Fragment>)}</div>
          <p>Walk to {FLOORS[start.floorKey].transition.label}, then take the stairs to the {FLOORS[end.floorKey].name.toLowerCase()} floor.</p>
        </div>}
        {start&&end?<div className="imap-summary"><Navigation size={18}/><div><strong>{start.label} → {end.label}</strong><span>{routePlan.minutes} min · {routePlan.crossFloor?`${routePlan.transfers} floor transition${routePlan.transfers>1?'s':''}`:'shortest corridor path'}</span></div></div>:<div className="imap-tip"><LocateFixed size={17}/><span>Select <strong>{selecting==='start'?'a starting point':'your destination'}</strong> on any floor.</span></div>}
      </aside>
      <main className="imap-map-card">
        <div className="imap-toolbar"><div><strong>{floor.name} floor plan</strong><span>Tap any labelled area</span></div><div className="imap-tools"><button onClick={()=>setRotation(r=>r-90)} title="Rotate left"><RotateCcw/></button><button onClick={reset} className="reset">Reset</button><button onClick={()=>setRotation(r=>r+90)} title="Rotate right"><RotateCw/></button><button onClick={()=>setZoom(z=>z>=1.35?.85:+(z+.15).toFixed(2))} title="Toggle zoom">{Math.round(zoom*100)}%</button></div></div>
        <FloorSvg floor={floor} start={start?.floorKey===floorKey?start:null} end={end?.floorKey===floorKey?end:null} route={route} transfer={currentTransfer} onZoneClick={choose} rotation={rotation} zoom={zoom}/>
        <div className="imap-map-note"><DoorOpen size={16}/><span>{routePlan.crossFloor?'Use the floor buttons in the route card to inspect each segment. The ⇅ marker shows the floor transition.':'Routes follow the digitized corridor network on the selected floor.'}</span></div>
      </main>
    </div>
  </div>;
}
