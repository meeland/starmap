const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;

const svg = document.getElementById('starmap');
const mapContainer = document.getElementById('map-container');
const mapGroup = document.getElementById('map-group');
const connectionsLayer = document.getElementById('connections-layer');
const routeVisualLayer = document.getElementById('route-visual-layer');
const planetsLayer = document.getElementById('planets-layer');
const voronoiLayer = document.getElementById('voronoi-layer'); 

const tooltip = document.getElementById('tooltip');
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

function buildLegend() {
    const legendContainer = document.getElementById('faction-legend');
    legendContainer.innerHTML = ''; 

    Object.values(factionsData).forEach(faction => {
        const block = document.createElement('div');
        block.className = 'legend-block';
        block.textContent = faction.name;
        
        block.style.backgroundColor = faction.secondaryColor;
        block.style.color = faction.mainColor;
        block.style.borderColor = faction.mainColor;
        
        legendContainer.appendChild(block);
    });
}

const btnLayerBare = document.getElementById('btn-layer-bare');
const btnLayerPol = document.getElementById('btn-layer-pol');

btnLayerBare.onclick = () => {
    voronoiLayer.style.display = 'none';
    btnLayerBare.classList.add('active');
    btnLayerPol.classList.remove('active');
    mapContainer.classList.remove('political-mode');
};

btnLayerPol.onclick = () => {
    voronoiLayer.style.display = 'block';
    btnLayerPol.classList.add('active');
    btnLayerBare.classList.remove('active');
    mapContainer.classList.add('political-mode');
};

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
    ring.setAttribute('stroke-width', '1');
    
    // Прямые углы для маршрутного кольца (4 сегмента)
    ring.setAttribute('stroke-dasharray', '4.854 3'); 
    ring.setAttribute('stroke-dashoffset', '1.5'); 
    
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
    
    if (scale <= 0.90) {
        planetsLayer.classList.add('hide-labels');
    } else {
        planetsLayer.classList.remove('hide-labels');
    }
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
        buildLegend();

        const [planetsData, connectionsData] = await Promise.all([fetchCSV(PLANETS_CSV_URL), fetchCSV(CONNECTIONS_CSV_URL)]);
        
        planetsList = planetsData.filter(p => p.id).map(p => {
            let factionName = p.faction ? p.faction.trim() : "";
            if (!factionName || !factionsData[factionName]) {
                p.faction = "Нейтральные Системы";
            } else {
                p.faction = factionName;
            }
            return p;
        });

        globalConnections = connectionsData.filter(c => c.from && c.to);
        planetsList.forEach(p => planetMap[p.id] = p);

        translateX = window.innerWidth / 2 - (MAP_SIZE / 2) * 0.3;
        translateY = window.innerHeight / 2 - (MAP_SIZE / 2) * 0.3;
        scale = 0.3;
        updateTransform();

        // -- Логика Вороного с отрисовкой границ ТОЛЬКО между разными фракциями внутри сектора --
        const points = planetsList.map(p => [(p.x / 100) * MAP_SIZE, (p.y / 100) * MAP_SIZE]);
        const delaunay = d3.Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, MAP_SIZE, MAP_SIZE]);

        // Собираем карту граней (edges), чтобы знать, с кем граничит каждая ячейка
        const edges = new Map();
        planetsList.forEach((p, i) => {
            const poly = voronoi.cellPolygon(i);
            if (!poly) return;
            for (let j = 0; j < poly.length - 1; j++) {
                const p1 = poly[j];
                const p2 = poly[j+1];
                let pt1, pt2;
                if (p1[0] < p2[0] - 0.001 || (Math.abs(p1[0] - p2[0]) <= 0.001 && p1[1] < p2[1])) {
                    pt1 = p1; pt2 = p2;
                } else {
                    pt1 = p2; pt2 = p1;
                }
                const key = `${pt1[0].toFixed(2)},${pt1[1].toFixed(2)}-${pt2[0].toFixed(2)},${pt2[1].toFixed(2)}`;
                
                if (!edges.has(key)) edges.set(key, []);
                edges.get(key).push({ cell: i, p1, p2 });
            }
        });

        const defGroup = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        voronoiLayer.appendChild(defGroup);

        planetsList.forEach((planet, i) => {
            const pathData = voronoi.renderCell(i);
            if (!pathData) return;
            
            const factionInfo = factionsData[planet.faction];
            const isNeutral = (planet.faction === "Нейтральные Системы");

            // 1. Создаем Clip Path для эффекта "внутренней обводки"
            const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clip.setAttribute('id', `clip-cell-${i}`);
            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            clipPath.setAttribute('d', pathData);
            clip.appendChild(clipPath);
            defGroup.appendChild(clip);

            // 2. Фон территории (бесшовный, сливается с союзниками)
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            bg.setAttribute('d', pathData);
            bg.setAttribute('class', 'voronoi-bg');
            // Если нейтральный - фон прозрачный
            bg.style.fill = isNeutral ? "transparent" : factionInfo.secondaryColor;
            voronoiLayer.appendChild(bg);

            // 3. Высчитываем границы (только с другими фракциями)
            let borderPath = "";
            const poly = voronoi.cellPolygon(i);
            if (poly) {
                for (let j = 0; j < poly.length - 1; j++) {
                    const p1 = poly[j];
                    const p2 = poly[j+1];
                    let pt1, pt2;
                    if (p1[0] < p2[0] - 0.001 || (Math.abs(p1[0] - p2[0]) <= 0.001 && p1[1] < p2[1])) {
                        pt1 = p1; pt2 = p2;
                    } else {
                        pt1 = p2; pt2 = p1;
                    }
                    const key = `${pt1[0].toFixed(2)},${pt1[1].toFixed(2)}-${pt2[0].toFixed(2)},${pt2[1].toFixed(2)}`;
                    
                    const edgeData = edges.get(key);
                    let isBorder = false;
                    
                    if (edgeData.length === 1) {
                        isBorder = true; // Это край карты
                    } else {
                        const otherCellInfo = edgeData.find(e => e.cell !== i);
                        if (otherCellInfo && planetsList[otherCellInfo.cell].faction !== planet.faction) {
                            isBorder = true; // Это граница с чужой фракцией
                        }
                    }

                    if (isBorder) {
                        borderPath += `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} `;
                    }
                }
            }

            // 4. Отрисовка внешней границы (внутри ячейки благодаря clip-path)
            if (borderPath) {
                const border = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                border.setAttribute('d', borderPath);
                border.setAttribute('class', 'voronoi-border');
                border.style.stroke = factionInfo.mainColor;
                border.style.fill = "none";
                border.setAttribute('clip-path', `url(#clip-cell-${i})`);
                
                // Для нейтральных линий обводка тоньше в 2 раза
                // Поскольку линия режется пополам (clip-path), задаем двойную толщину: 3 для обычных (видимо 1.5), 1.5 для нейтральных (видимо 0.75)
                border.style.strokeWidth = isNeutral ? "1.5" : "3";
                voronoiLayer.appendChild(border);
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
                
                let routeColor = '#8b8b8b'; 
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
            
            const factionInfo = factionsData[planet.faction];
            const color = factionInfo.mainColor;
            const secondaryColor = factionInfo.secondaryColor;

            const hoverRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hoverRing.setAttribute('cx', absX);
            hoverRing.setAttribute('cy', absY);
            hoverRing.setAttribute('r', 5);
            hoverRing.setAttribute('fill', 'none');
            hoverRing.setAttribute('stroke', '#ffcc00');
            hoverRing.setAttribute('stroke-width', '1');
            
            // Прямые углы (крест) для желтого кольца
            hoverRing.setAttribute('stroke-dasharray', '4.854 3'); 
            hoverRing.setAttribute('stroke-dashoffset', '1.5');
            hoverRing.setAttribute('class', 'hover-ring');
            hoverRing.style.display = 'none';
            group.appendChild(hoverRing);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', absX);
            circle.setAttribute('cy', absY);
            circle.setAttribute('r', 2.75); 
            circle.setAttribute('fill', color);
            circle.setAttribute('class', 'planet-circle');
            group.appendChild(circle);

            const fontSize = 3.5;
            // Увеличен множитель ширины, чтобы точно влезали длинные названия
            const estTextWidth = planet.name.length * 2.7; 
            const paddingX = 2;
            const paddingY = 0.5;
            const rectWidth = estTextWidth + paddingX * 2;
            const rectHeight = fontSize + paddingY * 2;

            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            textBg.setAttribute('x', absX - rectWidth / 2);
            // Блок и текст подняты на 2 пикселя
            textBg.setAttribute('y', absY + 3.5); 
            textBg.setAttribute('width', rectWidth);
            textBg.setAttribute('height', rectHeight);
            textBg.setAttribute('rx', 1.5);
            textBg.setAttribute('class', 'planet-label-bg');
            group.appendChild(textBg);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = planet.name;
            text.setAttribute('x', absX);
            text.setAttribute('y', absY + 7); // Было 9, поднято на 2
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');
            text.style.setProperty('--faction-color', color);
            group.appendChild(text);

            circle.addEventListener('mouseover', () => {
                hoverRing.style.display = 'block';
            });

            circle.addEventListener('mouseout', () => {
                hoverRing.style.display = 'none';
            });

            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                
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
