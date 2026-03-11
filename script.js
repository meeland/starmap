const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;
const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group');
const planetsLayer = document.getElementById('planets-layer');
const connectionsLayer = document.getElementById('connections-layer');
const activeRouteLayer = document.getElementById('active-route-layer');

let scale = 0.35, translateX = 100, translateY = 100;
let isDragging = false, startX, startY;
let planetsList = [];
let planetMap = {};

// Графы маршрутов
let adjacencyMap = {}; 
let isolatedPlanets = {};

// Режим навигатора
let isRouteMode = false;
let routeNodes = [];
let dist0 = 0, distColor = 0, distOff = 0;

async function initMap() {
    const planetsData = await fetchCSV(PLANETS_CSV_URL);
    const connectionsData = await fetchCSV(CONNECTIONS_CSV_URL);
    planetsList = planetsData.filter(p => p.id);
    
    planetsList.forEach(p => {
        planetMap[p.id] = p;
        adjacencyMap[p.id] = {};
        isolatedPlanets[p.id] = true; // Считаем изолированной, пока не найдем связь
    });

    // Отрисовка линий и построение графов связей
    connectionsData.forEach(conn => {
        const p1 = planetMap[conn.from], p2 = planetMap[conn.to];
        const routeType = Object.values(conn)[2] || '0'; 
        
        if (p1 && p2) {
            // Записываем связь
            adjacencyMap[p1.id][p2.id] = routeType;
            adjacencyMap[p2.id][p1.id] = routeType;
            isolatedPlanets[p1.id] = false;
            isolatedPlanets[p2.id] = false;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', (p1.x/100)*MAP_SIZE); line.setAttribute('y1', (p1.y/100)*MAP_SIZE);
            line.setAttribute('x2', (p2.x/100)*MAP_SIZE); line.setAttribute('y2', (p2.y/100)*MAP_SIZE);
            line.setAttribute('class', 'connection');
            
            let routeColor = '#444'; 
            if (routeType === 'V') routeColor = '#8a2be2'; 
            else if (routeType === 'G') routeColor = '#2ecc71'; 
            else if (routeType === 'Y') routeColor = '#f1c40f'; 
            else if (routeType === 'R') routeColor = '#e74c3c'; 
            else if (routeType === 'B') routeColor = '#3498db'; 
            
            line.style.stroke = routeColor;
            connectionsLayer.appendChild(line);
        }
    });

    // Отрисовка планет
    planetsList.forEach(planet => {
        const x = (planet.x/100)*MAP_SIZE, y = (planet.y/100)*MAP_SIZE;
        const faction = factionsData[planet.faction] || factionsData["Нейтральные Системы"];

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x); circle.setAttribute('cy', y);
        circle.setAttribute('r', 2.75); 
        circle.setAttribute('fill', faction.mainColor);
        circle.setAttribute('class', 'planet-circle');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = planet.name;
        text.setAttribute('x', x); text.setAttribute('y', y + 8);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'planet-label');

        // Обработка клика по планете (Маршрут ИЛИ Инфо)
        circle.onclick = (e) => {
            e.stopPropagation();
            if (isRouteMode) {
                handleRouteClick(planet);
            } else {
                document.getElementById('tt-title').textContent = planet.name;
                document.getElementById('tt-info').textContent = planet.info;
                document.getElementById('tt-faction-badge').textContent = faction.name;
                document.getElementById('tt-faction-badge').style.color = faction.mainColor;
                
                const tt = document.getElementById('tooltip');
                tt.style.display = 'block';
                tt.style.left = e.pageX + 10 + 'px';
                tt.style.top = e.pageY + 10 + 'px';
                tt.style.borderColor = faction.secondaryColor;
            }
        };

        g.appendChild(circle); g.appendChild(text);
        planetsLayer.appendChild(g);
    });
    
    updateTransform();
}

// ----- ЛОГИКА МАРШРУТОВ ----- //

const btnToggleRoute = document.getElementById('btn-toggle-route');
const routeStatsPanel = document.getElementById('route-stats');

btnToggleRoute.addEventListener('click', () => {
    isRouteMode = !isRouteMode;
    if (isRouteMode) {
        btnToggleRoute.textContent = 'ЗАКРЫТЬ МАРШРУТ';
        btnToggleRoute.style.background = 'var(--hud-accent)';
        btnToggleRoute.style.color = 'var(--hud-bg)';
        routeStatsPanel.style.display = 'block';
    } else {
        btnToggleRoute.textContent = 'ПОСТРОИТЬ МАРШРУТ';
        btnToggleRoute.style.background = 'var(--hud-secondary)';
        btnToggleRoute.style.color = 'var(--hud-accent)';
        routeStatsPanel.style.display = 'none';
        resetRoute(); // Сброс при выходе из режима
    }
});

document.getElementById('btn-reset-route').addEventListener('click', resetRoute);

function calcDistance(p1, p2) {
    const x1 = (p1.x/100)*MAP_SIZE, y1 = (p1.y/100)*MAP_SIZE;
    const x2 = (p2.x/100)*MAP_SIZE, y2 = (p2.y/100)*MAP_SIZE;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function handleRouteClick(planet) {
    if (routeNodes.length === 0) {
        addPlanetToRoute(planet, null);
    } else {
        const lastPlanet = routeNodes[routeNodes.length - 1];
        
        // Проверяем: есть ли связь ИЛИ система полностью изолирована
        const connectionType = adjacencyMap[lastPlanet.id][planet.id];
        const isIsolated = isolatedPlanets[planet.id];

        if (connectionType !== undefined || isIsolated) {
            addPlanetToRoute(planet, connectionType);
        }
        // Иначе клик игнорируется
    }
}

function addPlanetToRoute(planet, connectionType) {
    if (routeNodes.length > 0) {
        const last = routeNodes[routeNodes.length - 1];
        const dist = calcDistance(last, planet);

        if (connectionType === undefined) {
            distOff += dist;
        } else if (['V', 'G', 'Y', 'R', 'B'].includes(connectionType)) {
            distColor += dist;
        } else {
            dist0 += dist; // Серые пути или тип 0
        }
    }
    
    routeNodes.push(planet);
    updateRouteUI();
    drawRoute();
}

function updateRouteUI() {
    document.getElementById('route-count').textContent = routeNodes.length;
    document.getElementById('route-dist-0').textContent = dist0.toFixed(1);
    document.getElementById('route-dist-color').textContent = distColor.toFixed(1);
    document.getElementById('route-dist-off').textContent = distOff.toFixed(1);
}

function drawRoute() {
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
    routeNodes = [];
    dist0 = 0; distColor = 0; distOff = 0;
    updateRouteUI();
    drawRoute();
}

// ----- ВЗАИМОДЕЙСТВИЕ С КАРТОЙ ----- //

function updateTransform() {
    mapGroup.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`);
    document.getElementById('zoom-level').textContent = scale.toFixed(2);
}

// Удалено отслеживание координат, оставлен только драг-энд-дроп
svg.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; 
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
});

window.addEventListener('mouseup', () => isDragging = false);

svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1);
    let newScale = Math.max(0.1, Math.min(scale * zoomFactor, 8)); 
    const actualZoomFactor = newScale / scale;

    translateX = mouseX - (mouseX - translateX) * actualZoomFactor;
    translateY = mouseY - (mouseY - translateY) * actualZoomFactor;
    scale = newScale;
    updateTransform();
}, { passive: false });

svg.addEventListener('click', () => document.getElementById('tooltip').style.display = 'none');

function fetchCSV(url) {
    return new Promise(res => Papa.parse(url, { download: true, header: true, complete: r => res(r.data) }));
}

initMap();
