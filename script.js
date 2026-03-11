const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;

const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group');
const connectionsLayer = document.getElementById('connections-layer');
const planetsLayer = document.getElementById('planets-layer');
const routeVisualLayer = document.getElementById('route-visual-layer');

const tooltip = document.getElementById('tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const ttFactionBadge = document.getElementById('tt-faction-badge');

// Состояние маршрута
let isRoutingMode = false;
let routeNodes = [];
let routeLines = [];
let d0 = 0, dColor = 0, dOff = 0;

let planetsList = [];
let connectionsList = [];

let isDragging = false;
let startX, startY;
let translateX = 0, translateY = 0;
let scale = 1;

// Инициализация управления
document.getElementById('btn-toggle-route').onclick = () => {
    isRoutingMode = !isRoutingMode;
    document.getElementById('route-panel').style.display = isRoutingMode ? 'block' : 'none';
    if (!isRoutingMode) resetRoute();
};

document.getElementById('btn-reset-route').onclick = resetRoute;

function resetRoute() {
    routeNodes = [];
    d0 = 0; dColor = 0; dOff = 0;
    routeLines.forEach(l => l.remove());
    routeLines = [];
    updateRouteUI();
}

function updateRouteUI() {
    document.getElementById('route-dist-0').textContent = d0.toFixed(1);
    document.getElementById('route-dist-color').textContent = dColor.toFixed(1);
    document.getElementById('route-dist-off').textContent = dOff.toFixed(1);
    document.getElementById('route-points').textContent = routeNodes.length;
}

// Загрузка
async function initMap() {
    try {
        const [pRes, cRes] = await Promise.all([
            fetch(PLANETS_CSV_URL).then(r => r.text()),
            fetch(CONNECTIONS_CSV_URL).then(r => r.text())
        ]);

        planetsList = Papa.parse(pRes, {header:true}).data.filter(p => p.id);
        connectionsList = Papa.parse(cRes, {header:true}).data.filter(c => c.from);

        const planetMap = {};
        planetsList.forEach(p => planetMap[p.id] = p);

        // Отрисовка связей
        connectionsList.forEach(c => {
            const p1 = planetMap[c.from], p2 = planetMap[c.to];
            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', (p1.x/100)*MAP_SIZE);
                line.setAttribute('y1', (p1.y/100)*MAP_SIZE);
                line.setAttribute('x2', (p2.x/100)*MAP_SIZE);
                line.setAttribute('y2', (p2.y/100)*MAP_SIZE);
                line.setAttribute('class', 'connection');
                line.style.stroke = getPathColor(c.type);
                connectionsLayer.appendChild(line);
            }
        });

        // Отрисовка планет
        planetsList.forEach(planet => {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const x = (planet.x/100)*MAP_SIZE, y = (planet.y/100)*MAP_SIZE;

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x); circle.setAttribute('cy', y);
            circle.setAttribute('r', 3.5); circle.setAttribute('class', 'planet-circle');
            circle.style.fill = (factionsData[planet.faction] || factionsData["Нейтральные Системы"]).mainColor;

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x); label.setAttribute('y', y + 10);
            label.setAttribute('class', 'planet-label');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = planet.name;

            group.appendChild(circle); group.appendChild(label);
            
            group.onclick = (e) => {
                e.stopPropagation();
                if (isRoutingMode) {
                    handleRouteClick(planet);
                } else {
                    showTooltip(planet, e);
                }
            };

            planetsLayer.appendChild(group);
        });

        setupZoomPan();
        setupSearch();
    } catch (e) { console.error(e); }
}

function handleRouteClick(planet) {
    if (routeNodes.length === 0) {
        routeNodes.push(planet);
        updateRouteUI();
        return;
    }

    const last = routeNodes[routeNodes.length - 1];
    if (last.id === planet.id) return;

    const conn = connectionsList.find(c => 
        (c.from == last.id && c.to == planet.id) || (c.to == last.id && c.from == planet.id)
    );

    const isTargetIsolated = !connectionsList.some(c => c.from == planet.id || c.to == planet.id);

    if (conn || isTargetIsolated) {
        // Расчет расстояния (в единицах MAP_SIZE)
        const dist = Math.sqrt(Math.pow(planet.x - last.x, 2) + Math.pow(planet.y - last.y, 2)) * (MAP_SIZE / 100);

        if (conn) {
            const type = conn.type || '0';
            if (type === '0') d0 += dist;
            else if (['V','G','Y','R','B'].includes(type)) dColor += dist;
        } else {
            dOff += dist;
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', (last.x/100)*MAP_SIZE);
        line.setAttribute('y1', (last.y/100)*MAP_SIZE);
        line.setAttribute('x2', (planet.x/100)*MAP_SIZE);
        line.setAttribute('y2', (planet.y/100)*MAP_SIZE);
        line.setAttribute('class', 'route-line');
        routeVisualLayer.appendChild(line);
        routeLines.push(line);

        routeNodes.push(planet);
        updateRouteUI();
    }
}

function getPathColor(type) {
    const colors = { 'V': '#ff00ff', 'G': '#00ff00', 'Y': '#ffff00', 'R': '#ff0000', 'B': '#0000ff' };
    return colors[type] || '#3d4963';
}

function showTooltip(planet, e) {
    const faction = factionsData[planet.faction] || factionsData["Нейтральные Системы"];
    ttTitle.textContent = planet.name;
    ttTitle.style.color = faction.mainColor;
    ttFactionBadge.textContent = planet.faction;
    ttFactionBadge.style.color = faction.mainColor;
    ttInfo.textContent = planet.info;
    tooltip.style.display = 'block';
    tooltip.style.left = e.pageX + 15 + 'px';
    tooltip.style.top = e.pageY + 15 + 'px';
}

function setupZoomPan() {
    const container = document.getElementById('map-container');
    container.onmousedown = (e) => { isDragging = true; startX = e.clientX - translateX; startY = e.clientY - translateY; };
    window.onmousemove = (e) => { if (isDragging) { translateX = e.clientX - startX; translateY = e.clientY - startY; applyTransform(); } };
    window.onmouseup = () => isDragging = false;
    container.onwheel = (e) => {
        e.preventDefault();
        const zoom = Math.exp(-e.deltaY * 0.001);
        scale *= zoom;
        scale = Math.min(Math.max(scale, 0.5), 10);
        applyTransform();
    };
}

function applyTransform() { mapGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`); }

function flyTo(x, y, z) {
    scale = z;
    translateX = window.innerWidth/2 - x*scale;
    translateY = window.innerHeight/2 - y*scale;
    applyTransform();
}

function setupSearch() {
    const input = document.getElementById('planet-search'), res = document.getElementById('search-results');
    input.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        res.innerHTML = '';
        if (!val) { res.style.display = 'none'; return; }
        const matches = planetsList.filter(p => p.name.toLowerCase().includes(val));
        if (matches.length) {
            res.style.display = 'block';
            matches.forEach(m => {
                const d = document.createElement('div'); d.className = 'search-item'; d.textContent = m.name;
                d.onclick = () => { flyTo((m.x/100)*MAP_SIZE, (m.y/100)*MAP_SIZE, 3); res.style.display = 'none'; input.value = ''; };
                res.appendChild(d);
            });
        }
    };
}

initMap();
svg.onclick = () => { if(!isRoutingMode) tooltip.style.display = 'none'; };
