const minor = ['G♯', 'D♯', 'A♯', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const major = ['B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'F', 'C', 'G', 'D', 'A', 'E'];
const wheel = document.querySelector('#camelot-wheel');
const segments = new Map();
const ns = 'http://www.w3.org/2000/svg';
const point = (radius, angle) => [250 + radius * Math.cos(angle), 250 + radius * Math.sin(angle)];

for (let number = 1; number <= 12; number++) {
  const angle = -Math.PI / 2 + (number - 1) * Math.PI / 6;
  for (const [mode, inner, outer, notes] of [['A', 73, 151, minor], ['B', 155, 237, major]]) {
    const code = `${number}${mode}`;
    const start = angle - Math.PI / 12 + .012;
    const end = angle + Math.PI / 12 - .012;
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'camelot-segment');
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `${code}: ${notes[number - 1]} ${mode === 'A' ? 'menor' : 'mayor'}`);
    group.setAttribute('aria-pressed', 'false');
    group.style.setProperty('--segment-color', `hsl(${(number - 1) * 30 + 190} 55% ${mode === 'A' ? 30 : 39}%)`);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${point(outer, start)} A ${outer} ${outer} 0 0 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 0 ${point(inner, start)} Z`);
    group.append(path);
    const [x, y] = point((inner + outer) / 2, angle);
    for (const [label, offset, className] of [[code, -3, 'camelot-code'], [notes[number - 1], 16, 'camelot-note']]) {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + offset);
      text.setAttribute('class', className);
      text.textContent = label;
      group.append(text);
    }
    group.addEventListener('click', () => selectCamelot(code));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectCamelot(code);
      }
    });
    segments.set(code, group);
    wheel.append(group);
  }
}
const center = document.createElementNS(ns, 'text');
center.setAttribute('x', '250');
center.setAttribute('y', '255');
center.setAttribute('class', 'camelot-center');
center.textContent = 'CAMELOT';
wheel.append(center);

export function selectCamelot(code) {
  const match = /^(1[0-2]|[1-9])([AB])$/.exec(code ?? '');
  const compatible = new Set();
  if (match) {
    const number = Number(match[1]);
    const mode = match[2];
    compatible.add(`${number === 1 ? 12 : number - 1}${mode}`);
    compatible.add(`${number === 12 ? 1 : number + 1}${mode}`);
    compatible.add(`${number}${mode === 'A' ? 'B' : 'A'}`);
    document.querySelector('#camelot-selected').textContent = `${code} · ${(mode === 'A' ? minor : major)[number - 1]} ${mode === 'A' ? 'menor' : 'mayor'}`;
    document.querySelector('#camelot-compatible').textContent = `Combinaciones compatibles: ${code}, ${[...compatible].join(', ')}.`;
  } else {
    document.querySelector('#camelot-selected').textContent = 'Selecciona una tonalidad';
    document.querySelector('#camelot-compatible').textContent = 'Mezcla con el mismo código, los números vecinos o la misma cifra en el otro anillo.';
  }
  for (const [value, segment] of segments) {
    segment.classList.toggle('is-selected', value === code);
    segment.classList.toggle('is-compatible', compatible.has(value));
    segment.setAttribute('aria-pressed', String(value === code));
  }
}
