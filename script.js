const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;

const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group');
const connectionsLayer = document.getElementById('connections-layer');
const routeVisualLayer = document.getElementById('route-visual-layer');
const planetsLayer = document.getElementById('planets-layer');
const voronoiLayer = document.getElementById('voronoi-layer'); 

const tooltip = document.getElementById('tooltip');
const hoverTooltip = document.getElementById('hover-tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const ttFactionBadge = document.getElementById('tt-faction-badge');
const zoomLevelText = document.getElementById('zoom-level');

let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

let planetsList = [];
let planetMap = {};
let globalConnections = []; 

let isRoutingMode = false;
let routeNodes = [];
let routeVisualElements = []; 
let d0 = 0, dColor = 0, dOff = 0;

// Универсальный резервный цвет, если фракция не найдена
const fallbackFaction = { name: "Неизвестно", mainColor: "#ffffff", secondaryColor: "#555555" };

// Автоматическая генерация легенды из faction.js
function buildLegend() {
    const legendContainer = document.getElementById('faction-legend');
    legendContainer.innerHTML = ''; 

    Object.values(factionsData).forEach(faction => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        
        const colorBox = document.createElement('span');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = faction.mainColor;
        
        item.appendChild(colorBox);
        item.appendChild(document.createTextNode(' ' + faction.name));
        
        legendContainer.appendChild(item);
    });
}

// Управление слоями
const btnLayerBare = document.getElementById('btn-layer-bare');
const btnLayerPol = document.getElementById('btn-layer-pol');

btnLayerBare.onclick = () => {
    voronoiLayer.style.display = 'none';
    btnLayerBare.classList.add('active');
    btnLayerPol.classList.remove('active');
};

btnLayerPol.onclick = () => {
    voronoiLayer.style.display = 'block';
    btnLayerPol.classList.add('active');
    btnLayerBare.classList.remove('active');
};

// Управление маршрутизатором
document.getElementById('btn-toggle-route').onclick = (e) => {
    isRoutingMode = !isRoutingMode;
    
    const panel = document.getElementById('route-panel');
    if (isRoutingMode) {
        panel.classList.add('open');
        e.target.classList.add('active');
    } else {
        panel.classList.remove('open');
        e.target.classList.remove('active');
        resetRoute();
    }
};

document.getElementById('btn-reset-route').onclick = resetRoute;

function resetRoute() {
    routeNodes = [];
    d0 = 0; dColor = 0; dOff = 0;
    routeVisualElements.forEach(el => el.remove());
    routeVisualElements = [];
    updateRouteUI();
}

function updateRouteUI() {
    document.getElementById('route-dist-0').textContent = d0.toFixed(1);
    document.getElementById('route-dist-color').textContent = dColor.toFixed(1);
    document.getElementById('route-dist-off').textContent = dOff.toFixed(1);
    document.getElementById('route-points').textContent = routeNodes.length;
}

function createRouteRing(x, y) {
    const ringGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    ringGroup.setAttribute('transform', `translate(${x}, ${y})`);
    
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('r', 8);
    ring.setAttribute('cx', 0);
    ring.setAttribute('cy', 0);
    ring.setAttribute('class', 'route-ring');
    
    ringGroup.appendChild(ring);
    routeVisualLayer.appendChild(ringGroup);
    return ringGroup;
}

function handleRouteClick(planet) {
    const absX2 = (planet.x / 100) * MAP_SIZE;
    const absY2 = (planet.y / 100) * MAP_SIZE;

    if (routeNodes.length === 0) {
        routeNodes.push(planet);
        routeVisualElements.push(createRouteRing(absX2, absY2));
        updateRouteUI();
        return;
    }

    const last = routeNodes[routeNodes.length - 1];
    if (last.id === planet.id) return;

    const conn = globalConnections.find(c => 
        (c.from == last.id && c.to == planet.id) || (c.to == last.id && c.from == planet.id)
    );

    const isTargetIsolated = !globalConnections.some(c => c.from == planet.id || c.to == planet.id);
    const isLastIsolated = !globalConnections.some(c => c.from == last.id || c.to == last.id);

    if (conn || isTargetIsolated || isLastIsolated) {
        const absX1 = (last.x / 100) * MAP_SIZE;
        const absY1 = (last.y / 100) * MAP_SIZE;
        const dist = Math.sqrt(Math.pow(absX2 - absX1, 2) + Math.pow(absY2 - absY1, 2));

        if (conn) {
            const type = Object.values(conn)[2] || '0';
            if (type === '0') d0 += dist;
            else if (['V','G','Y','R','B'].includes(type)) dColor += dist;
        } else {
            dOff += dist;
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', absX1);
        line.setAttribute('y1', absY1);
        line.setAttribute('x2', absX2);
        line.setAttribute('y2', absY2);
        line.setAttribute('class', 'route-line');
        
        routeVisualLayer.appendChild(line);
        routeVisualElements.push(line);
        routeVisualElements.push(createRouteRing(absX2, absY2));

        routeNodes.push(planet);
        updateRouteUI();
    }
}

function updateTransform() {
    mapGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
    zoomLevelText.textContent = scale.toFixed(2);
}

function flyTo(x, y, targetScale = 2) {
    const rect = svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const targetX = centerX - x * targetScale;
    const targetY = centerY - y * targetScale;

    let progress = 0;
    const startTx = translateX, startTy = translateY, startS = scale;

    function animate() {
        progress += 0.05;
        if (progress > 1) progress = 1;
        
        const ease = progress * progress * (3 - 2 * progress);

        translateX = startTx + (targetX - startTx) * ease;
        translateY = startTy + (targetY - startTy) * ease;
        scale = startS + (targetScale - startS) * ease;
        
        updateTransform();

        if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

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

document.getElementById('btn-zoom-in').onclick = () => flyTo((window.innerWidth/2 - translateX)/scale, (window.innerHeight/2 - translateY)/scale, scale * 1.5);
document.getElementById('btn-zoom-out').onclick = () => flyTo((window.innerWidth/2 - translateX)/scale, (window.innerHeight/2 - translateY)/scale, scale / 1.5);
document.getElementById('btn-reset').onclick = () => flyTo(MAP_SIZE/2, MAP_SIZE/2, 0.5);

function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, complete: results => resolve(results.data), error: err => reject(err) });
    });
}

async function initMap() {
    try {
        buildLegend(); // Генерируем легенду перед загрузкой данных

        const [planetsData, connectionsData] = await Promise.all([fetchCSV(PLANETS_CSV_URL), fetchCSV(CONNECTIONS_CSV_URL)]);
        planetsList = planetsData.filter(p => p.id);
        globalConnections = connectionsData.filter(c => c.from && c.to);
        
        planetsList.forEach(p => planetMap[p.id] = p);

        translateX = window.innerWidth / 2 - (MAP_SIZE / 2) * 0.3;
        translateY = window.innerHeight / 2 - (MAP_SIZE / 2) * 0.3;
        scale = 0.3;
        updateTransform();

        const points = planetsList.map(p => [(p.x / 100) * MAP_SIZE, (p.y / 100) * MAP_SIZE]);
        const delaunay = d3.Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, MAP_SIZE, MAP_SIZE]);

        planetsList.forEach((planet, i) => {
            const pathData = voronoi.renderCell(i);
            if (pathData) {
                // Если фракция из CSV не найдена, используем fallback
                const factionInfo = factionsData[planet.faction] || fallbackFaction;
                
                const cell = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                cell.setAttribute('d', pathData);
                cell.setAttribute('class', 'voronoi-cell');
                cell.style.fill = factionInfo.mainColor;
                cell.style.stroke = factionInfo.secondaryColor;
                voronoiLayer.appendChild(cell);
            }
        });

        globalConnections.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];
            const routeType = Object.values(conn)[2]; 
            
            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', (p1.x / 100) * MAP_SIZE);
                line.setAttribute('y1', (p1.y / 100) * MAP_SIZE);
                line.setAttribute('x2', (p2.x / 100) * MAP_SIZE);
                line.setAttribute('y2', (p2.y / 100) * MAP_SIZE);
                line.setAttribute('class', 'connection');
                
                let routeColor = '#626465'; 
                if (routeType === 'V') routeColor = '#8a2be2'; 
                else if (routeType === 'G') routeColor = '#2ecc71'; 
                else if (routeType === 'Y') routeColor = '#f1c40f'; 
                else if (routeType === 'R') routeColor = '#e74c3c'; 
                else if (routeType === 'B') routeColor = '#3498db'; 
                
                line.style.stroke = routeColor;
                connectionsLayer.appendChild(line);
            }
        });

        planetsList.forEach(planet => {
            const absX = (planet.x / 100) * MAP_SIZE;
            const absY = (planet.y / 100) * MAP_SIZE;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            const factionInfo = factionsData[planet.faction] || fallbackFaction;
            const color = factionInfo.mainColor;
            const secondaryColor = factionInfo.secondaryColor;

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', absX);
            circle.setAttribute('cy', absY);
            circle.setAttribute('r', 2.75); 
            circle.setAttribute('fill', color);
            circle.setAttribute('class', 'planet-circle');

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = planet.name;
            text.setAttribute('x', absX);
            text.setAttribute('y', absY + 9); 
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');

            circle.addEventListener('mouseover', (e) => {
                hoverTooltip.textContent = planet.name; 
                hoverTooltip.style.left = `${e.pageX + 15}px`;
                hoverTooltip.style.top = `${e.pageY - 25}px`;
                hoverTooltip.style.borderColor = color;
                hoverTooltip.style.display = 'block';
            });

            circle.addEventListener('mouseout', () => hoverTooltip.style.display = 'none');

            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                hoverTooltip.style.display = 'none';
                
                if (isRoutingMode) {
                    handleRouteClick(planet);
                } else {
                    ttTitle.textContent = planet.name;
                    ttInfo.textContent = planet.info;
                    ttFactionBadge.textContent = factionInfo.name;
                    ttFactionBadge.style.color = color;
                    
                    tooltip.style.borderColor = secondaryColor; 
                    
                    tooltip.style.left = `${e.pageX + 15}px`;
                    tooltip.style.top = `${e.pageY + 15}px`;
                    tooltip.style.display = 'block';

                    flyTo(absX, absY, scale);
                }
            });

            group.appendChild(circle);
            group.appendChild(text);
            planetsLayer.appendChild(group);
        });

        svg.addEventListener('click', () => tooltip.style.display = 'none');
        setupSearch();

    } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
    }
}

function setupSearch() {
    const searchInput = document.getElementById('planet-search');
    const resultsDiv = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        resultsDiv.innerHTML = '';
        if (!val) { resultsDiv.style.display = 'none'; return; }

        const matches = planetsList.filter(p => p.name.toLowerCase().includes(val));
        
        if (matches.length > 0) {
            resultsDiv.style.display = 'block';
            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.textContent = match.name;
                div.onclick = () => {
                    searchInput.value = '';
                    resultsDiv.style.display = 'none';
                    const absX = (match.x / 100) * MAP_SIZE;
                    const absY = (match.y / 100) * MAP_SIZE;
                    flyTo(absX, absY, 3);
                };
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.style.display = 'none';
        }
    });
}

initMap();
