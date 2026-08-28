import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IndoorMapPage, { FLOORS, aStar, buildGraph, floorSequence } from './IndoorMapPage';

const center = zone => ({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });

const REQUIRED_LABELS = {
  ground: ['MakerSpace', 'G41', 'G4', 'G2', 'G55', 'G37', 'G1', 'E - HALL', 'Stage', 'Parking'],
  first: ['FN4', 'FN3', 'FN2', 'FN1', 'F35', 'F36', 'F37', 'F38', 'F39', 'F40', 'F42', 'F43A', 'F43B', 'F44', 'F45', 'F46', 'F47A', 'F5', 'F4', 'F6', 'F24', 'F26', 'F52', 'F53', 'F54', 'F3', 'F2', 'F1', 'F13', 'C. V. Raman Hall'],
  second: ['SN4', 'SN3', 'SN2', 'IT1', 'IT2', 'S42', 'S42A', 'S14', 'S13', 'S16', 'S17', 'S18', 'D4', 'D3', 'S4', 'S19', 'S22', 'S11', 'Library', 'V. S. Hall', 'D1'],
  backside: ['B-09', 'B-08', 'B-07', 'B-06', 'B-05', 'B-04', 'B-03', 'B-02', 'B-01', 'Yoga Hall', 'APJ Hall', 'Vachan', 'Main Building'],
};

describe('indoor map data integrity', () => {
  test.each(Object.entries(FLOORS))('%s uses an existing immutable floor asset', (key, floor) => {
    const file = path.join(process.cwd(), 'public', floor.image.replace(/^\//, ''));
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(1000);
    expect(floor.viewBox).toBe(`0 0 ${floor.width} ${floor.height}`);
  });

  test.each(Object.entries(REQUIRED_LABELS))('%s includes every readable room label', (key, labels) => {
    const actual = new Set(FLOORS[key].zones.map(zone => zone.label));
    labels.forEach(label => expect(actual).toContain(label));
  });

  test.each(Object.entries(FLOORS))('%s hotspots stay within the source image and do not overlap', (key, floor) => {
    floor.zones.forEach(zone => {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.w).toBeLessThanOrEqual(floor.overlayWidth || 1000);
      expect(zone.y + zone.h).toBeLessThanOrEqual(floor.overlayHeight || 650);
    });

    const overlaps = [];
    floor.zones.forEach((a, index) => floor.zones.slice(index + 1).forEach(b => {
      const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (width > 0.75 && height > 0.75) overlaps.push(`${a.id}/${b.id}`);
    }));
    expect(overlaps).toEqual([]);
  });

  test.each(Object.entries(FLOORS))('%s can route every mapped area to its transition node', (key, floor) => {
    const graph = buildGraph(floor.corridors);
    expect(graph.nodes.length).toBeGreaterThan(10);
    floor.zones.forEach(zone => {
      expect(aStar(graph, center(zone), floor.transition).length).toBeGreaterThan(1);
    });
  });
});

describe('multi-floor sequencing', () => {
  test('routes upward through intermediate floors', () => {
    expect(floorSequence('ground', 'second')).toEqual(['ground', 'first', 'second']);
  });

  test('routes downward in reverse order', () => {
    expect(floorSequence('second', 'ground')).toEqual(['second', 'first', 'ground']);
  });

  test('connects the backside through the ground floor', () => {
    expect(floorSequence('backside', 'second')).toEqual(['backside', 'ground', 'first', 'second']);
    expect(floorSequence('first', 'backside')).toEqual(['first', 'ground', 'backside']);
  });
});

describe('indoor map interactions', () => {
  let container;
  let root;

  const click = element => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const select = (element, value) => act(() => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = (element, value) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<IndoorMapPage />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('selects endpoints on different floors and exposes each route segment', () => {
    const roomSelect = () => container.querySelector('.imap-room-select select');
    const floorButton = name => [...container.querySelectorAll('[role="tab"]')].find(button => button.textContent === name);

    select(roomSelect(), 'makerspace');
    expect(container.querySelector('.imap-route-picker').textContent).toContain('Ground · MakerSpace');

    click(floorButton('Second'));
    select(roomSelect(), 's22');

    const routeCard = container.querySelector('.imap-floor-route');
    expect(routeCard).not.toBeNull();
    expect(routeCard.textContent).toContain('Ground→First→Second');
    expect(container.querySelector('.imap-summary').textContent).toContain('MakerSpace → S22');
    expect(container.querySelector('.imap-summary').textContent).toContain('2 floor transitions');
    expect(container.querySelector('.imap-route')).not.toBeNull();

    click(floorButton('Ground'));
    expect(container.querySelector('.imap-route')).not.toBeNull();
  });

  test('supports room search, swapping endpoints, and reset', () => {
    const roomSelect = container.querySelector('.imap-room-select select');
    select(roomSelect, 'g41');
    select(roomSelect, 'g55');
    expect(container.querySelector('.imap-summary').textContent).toContain('G41 → G55');

    click(container.querySelector('.imap-swap'));
    expect(container.querySelector('.imap-summary').textContent).toContain('G55 → G41');

    const search = container.querySelector('.imap-search input');
    input(search, 'Maker');
    expect(container.querySelector('.imap-results').textContent).toContain('MakerSpace');

    click([...container.querySelectorAll('button')].find(button => button.textContent === 'Reset'));
    expect(container.querySelector('.imap-summary')).toBeNull();
    expect(container.querySelector('.imap-tip').textContent).toContain('Select a starting point');
  });
});
