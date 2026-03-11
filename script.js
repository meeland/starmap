const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;
const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group');
const planetsLayer = document.getElementById('planets-layer');
const connectionsLayer = document.getElementById('connections-layer');
const activeRouteLayer = document.getElementById('active-route-layer');

// Состояние камеры
let scale = 0.35;
let translateX = window.innerWidth / 2 - (MAP_SIZE * 0.35) / 2;
let translateY = window.innerHeight / 2 - (MAP_SIZE * 0.35) / 2;
let isDragging = false;
let startX, startY;

// Данные
let planetsList = [];
let planetMap = {};
let adjacencyMap = {}; 
let isolatedPlanets = {};

// Режим навигатора
let isRouteMode = false;
let routeNodes = [];
let dist0 = 0, distColor = 0, distOff = 0;

// 1. ЗАГРУЗКА ДАННЫХ
async function initMap() {
    try {
        const planetsData = await fetchCSV(PLANETS_CSV_URL);
        const connectionsData = await fetchCSV(CONNECTIONS_CSV_URL);
        
        planetsList = planetsData.filter(p => p.id);
        
        // Очистка и подготовка графов
        planetsList.forEach(p => {
            planetMap[p.id] = p;
            adjacencyMap[p.id] = {};
            isolatedPlanets[p.id] = true;
        });

        // Рисуем гиперпространственные пути
        connectionsData.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];
            const routeType = Object.values(conn)[2] || '0'; 
            
            if (p1 && p2) {
                adjacencyMap[p1.id][p2.id] = routeType;
                adjacencyMap[p2.id][p1.id] = routeType;
                isolatedPlanets[p1.id] = false;
                isolatedPlanets[p2.id] = false;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', (p1.x/100)*MAP_SIZE);
                line.setAttribute('y1', (p1.y/100)*MAP_SIZE);
                line.setAttribute('x2', (p2.x/100)*MAP_SIZE);
                line.setAttribute('y2', (p2.y/100)*MAP_SIZE);
                line.setAttribute('class', 'connection');
                
                let color = '#444';
                if (routeType === 'V') color = '#8a2be2';
                else if (routeType === 'G') color = '#2ecc71';
                else if (routeType === 'Y') color = '#f1c40f';
                else if (routeType === 'R') color = '#e74c3c';
                else if (routeType === 'B') color = '#3498db';
                
                line.style.stroke = color;
                connectionsLayer.appendChild(line);
            }
        });

        // Рисуем планеты
        planetsList.forEach(planet => {
            const x = (planet.x/100)*MAP_SIZE;
            const y = (planet.y/100)*MAP_SIZE;
            const faction = factionsData[planet.faction] || factionsData["Нейтральные Системы"];

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', 3);
            circle.setAttribute('fill', faction.mainColor);
            circle.setAttribute('class', 'planet-circle');

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = planet.name;
            text.setAttribute('x', x);
            text.setAttribute('y', y + 10);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');

            circle.onclick = (e) => {
                e.stopPropagation();
                if (isRouteMode) {
                    handleRouteClick(planet);
                } else {
                    showTooltip(planet, faction, e.pageX, e.pageY);
                }
            };

            g.appendChild(circle);
            g.appendChild(text);
            planetsLayer.appendChild(g);
        });

        updateTransform();
        setupSearch();
    } catch (err) {
        console.error("Критическая ошибка карты:", err);
    }
}

// 2. ИНСТРУМЕНТ МАРШРУТОВ
const btnToggleRoute = document.getElementById('btn-toggle-route');
const routeStatsPanel = document.getElementById('route-stats');

btnToggleRoute.onclick = () => {
    isRouteMode = !isRouteMode;
    routeStatsPanel.style.display = isRouteMode ? 'block' : 'none';
    btnToggleRoute.textContent = isRouteMode ? 'ЗАКРЫТЬ МЕНЮ' : 'ПОСТРОИТЬ МАРШРУТ';
    if (!isRouteMode) resetRoute();
};

document.getElementById('btn-reset-route').onclick = resetRoute;

function handleRouteClick(planet) {
    if (routeNodes.length === 0) {
        addPlanetToRoute(planet, null);
    } else {
        const last = routeNodes[routeNodes.length - 1];
        const connType = adjacencyMap[last.id][planet.id];
        const isIsolated = isolatedPlanets[planet.id];

        // Условие: есть путь ИЛИ планета вообще не имеет путей
        if (connType !== undefined || isIsolated) {
            addPlanetToRoute(planet, connType);
        }
    }
}

function addPlanetToRoute(planet, type) {
    if (routeNodes.length > 0) {
        const last = routeNodes[routeNodes.length - 1];
        const d = Math.sqrt(Math.pow(planet.x - last.x, 2) + Math.pow(planet.y - last.y, 2)) * 10;
        
        if (type === undefined) distOff += d;
        else if (type === '0') dist0 += d;
        else distColor += d;
    }
    routeNodes.push(planet);
    updateRouteUI();
    drawRouteLine();
}

function updateRouteUI() {
    document.getElementById('route-count').textContent = routeNodes.length;
    document.getElementById('route-dist-0').textContent = Math.round(dist0);
    document.getElementById('route-dist-color').textContent = Math.round(distColor);
    document.getElementById('route-dist-off').textContent = Math.round(distOff);
}

function drawRouteLine() {
    activeRouteLayer.innerHTML = '';
    for (let i = 1; i < routeNodes.length; i++) {
        const p1 = routeNodes[i-1], p2 = routeNodes[i];
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', (p1.x/100)*MAP_SIZE); line.setAttribute('y1', (p1.y/100)*MAP_SIZE);
        line.setAttribute('x2', (p2.x/100)*MAP_SIZE); line.setAttribute('y2', (p2.y/100)*MAP_SIZE);
        line.setAttribute('class', 'active-route-line');
        activeRouteLayer.appendChild(line);
    }
}

function resetRoute() {
    routeNodes = []; dist0 = 0; distColor = 0; distOff = 0;
    updateRouteUI();
    activeRouteLayer.innerHTML = '';
}

// 3. УПРАВЛЕНИЕ КАМЕРОЙ
function updateTransform() {
    mapGroup.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`);
    document.getElementById('zoom-level').textContent = scale.toFixed(2);
}

svg.onmousedown = (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
};

window.onmousemove = (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
};

window.onmouseup = () => isDragging = false;

svg.onwheel = (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoom = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.2);
    const newScale = Math.max(0.1, Math.min(scale * zoom, 8));
    const factor = newScale / scale;

    translateX = mouseX - (mouseX - translateX) * factor;
    translateY = mouseY - (mouseY - translateY) * factor;
    scale = newScale;
    updateTransform();
};

// 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
function showTooltip(planet, faction, x, y) {
    const tt = document.getElementById('tooltip');
    document.getElementById('tt-title').textContent = planet.name;
    document.getElementById('tt-info').textContent = planet.info;
    document.getElementById('tt-faction-badge').textContent = faction.name;
    document.getElementById('tt-faction-badge').style.color = faction.mainColor;
    tt.style.borderColor = faction.secondaryColor;
    tt.style.left = x + 15 + 'px';
    tt.style.top = y + 15 + 'px';
    tt.style.display = 'block';
}

function setupSearch() {
    const input = document.getElementById('planet-search');
    const res = document.getElementById('search-results');
    input.oninput = () => {
        const val = input.value.toLowerCase();
        res.innerHTML = '';
        if (!val) { res.style.display = 'none'; return; }
        const matches = planetsList.filter(p => p.name.toLowerCase().includes(val)).slice(0, 10);
        if (matches.length) {
            res.style.display = 'block';
            matches.forEach(m => {
                const d = document.createElement('div');
                d.className = 'search-item';
                d.textContent = m.name;
                d.onclick = () => {
                    input.value = ''; res.style.display = 'none';
                    translateX = window.innerWidth/2 - ((m.x/100)*MAP_SIZE) * 2;
                    translateY = window.innerHeight/2 - ((m.y/100)*MAP_SIZE) * 2;
                    scale = 2;
                    updateTransform();
                };
                res.appendChild(d);
            });
        }
    };
}

function fetchCSV(url) {
    return new Promise((res, rej) => Papa.parse(url, { download: true, header: true, complete: r => res(r.data), error: e => rej(e) }));
}

document.getElementById('btn-zoom-in').onclick = () => { scale *= 1.4; updateTransform(); };
document.getElementById('btn-zoom-out').onclick = () => { scale /= 1.4; updateTransform(); };
document.getElementById('btn-reset').onclick = () => { scale = 0.35; translateX = 100; translateY = 100; updateTransform(); };
svg.onclick = () => document.getElementById('tooltip').style.display = 'none';

initMap();
