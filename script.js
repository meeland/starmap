const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';
const OBJECTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=333417344&single=true&output=csv';

const MAP_SIZE = 4000;

// Цвета для слоя Регионов
const regionColors = {
    "1": "#714b36", // Глубокое ядро
    "2": "#715736", // Центральные миры
    "3": "#716e36", // Колонии
    "4": "#367150", // Внутреннее кольцо
    "5": "#366f71", // Среднее кольцо
    "6": "#4b3671", // Регион Экспансии
    "7": "#4e7136", // Пространство хаттов
    "8": "#713d36", // Внешнее Кольцо
    "9": "#114c59"  // Дикое пространство
};

const svg = document.getElementById('starmap');
const mapContainer = document.getElementById('map-container');
const mapGroup = document.getElementById('map-group');
const connectionsLayer = document.getElementById('connections-layer');
const routeVisualLayer = document.getElementById('route-visual-layer');
const planetsLayer = document.getElementById('planets-layer');
const voronoiLayer = document.getElementById('voronoi-layer'); 
const voronoiRegionLayer = document.getElementById('voronoi-region-layer'); 
const objectsLayer = document.getElementById('objects-layer');

const tooltip = document.getElementById('tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const ttFactionBadge = document.getElementById('tt-faction-badge');
const ttWiki = document.getElementById('tt-wiki');
const hoverCoords = document.getElementById('hover-coords');
const zoomLevelText = document.getElementById('zoom-level');

let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

let planetsList = [];
const planetMap = {};
let globalConnections = []; 

let isRoutingMode = false;
let routeNodes = [];
let routeVisualElements = []; 
let d0 = 0, dColor = 0, dOff = 0;
let activeFlyToId = null; // Устранение бага с конфликтом анимаций flyTo

function buildLegend() {
    const legendContainer = document.getElementById('faction-legend');
    legendContainer.innerHTML = ''; 

    const factionCounts = {};
    planetsList.forEach(p => {
        factionCounts[p.faction] = (factionCounts[p.faction] || 0) + 1;
    });

    const fragment = document.createDocumentFragment();

    Object.values(factionsData).forEach(faction => {
        const block = document.createElement('div');
        block.className = 'legend-block';
        block.style.backgroundColor = faction.secondaryColor;
        block.style.color = faction.mainColor;
        block.style.borderColor = faction.mainColor;
        
        const count = factionCounts[faction.name] || 0;
        
        const countBadge = document.createElement('div');
        countBadge.className = 'faction-count';
        countBadge.textContent = count;
        countBadge.style.backgroundColor = faction.mainColor;
        countBadge.style.color = faction.secondaryColor;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = faction.name;
        
        block.appendChild(countBadge);
        block.appendChild(nameSpan);
        fragment.appendChild(block);
    });

    legendContainer.appendChild(fragment);
}

document.getElementById('legend-header').addEventListener('click', () => {
    const panel = document.getElementById('legend');
    const content = document.getElementById('faction-legend');
    const arrow = document.getElementById('legend-arrow');
    
    panel.classList.toggle('collapsed');
    
    if (panel.classList.contains('collapsed')) {
        content.style.display = 'none';
        arrow.textContent = '▶';
    } else {
        content.style.display = 'block';
        arrow.textContent = '⯆';
    }
});

const btnLayerBare = document.getElementById('btn-layer-bare');
const btnLayerPol = document.getElementById('btn-layer-pol');
const btnLayerReg = document.getElementById('btn-layer-reg');

function setMapMode(mode) {
    voronoiLayer.style.display = 'none';
    voronoiRegionLayer.style.display = 'none';
    btnLayerBare.classList.remove('active');
    btnLayerPol.classList.remove('active');
    btnLayerReg.classList.remove('active');
    mapContainer.classList.remove('political-mode', 'region-mode');

    if (mode === 'bare') {
        btnLayerBare.classList.add('active');
    } else if (mode === 'pol') {
        voronoiLayer.style.display = 'block';
        btnLayerPol.classList.add('active');
        mapContainer.classList.add('political-mode');
    } else if (mode === 'reg') {
        voronoiRegionLayer.style.display = 'block';
        btnLayerReg.classList.add('active');
        mapContainer.classList.add('region-mode');
    }
}

btnLayerBare.onclick = () => setMapMode('bare');
btnLayerPol.onclick = () => setMapMode('pol');
btnLayerReg.onclick = () => setMapMode('reg');

document.getElementById('route').onclick = (e) => {
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
    ring.setAttribute('r', '6');
    ring.setAttribute('cx', '0');
    ring.setAttribute('cy', '0');
    ring.setAttribute('class', 'route-ring');
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('stroke-dasharray', '5.854 2'); 
    ring.setAttribute('stroke-dashoffset', '6.854'); 
    
    ringGroup.appendChild(ring);
    routeVisualLayer.appendChild(ringGroup);
    return ringGroup;
}

function handleRouteClick(targetNode) {
    const absX2 = (targetNode.x / 100) * MAP_SIZE;
    const absY2 = (targetNode.y / 100) * MAP_SIZE;

    if (routeNodes.length === 0) {
        routeNodes.push(targetNode);
        routeVisualElements.push(createRouteRing(absX2, absY2));
        updateRouteUI();
        return;
    }

    const last = routeNodes[routeNodes.length - 1];
    if (last.id === targetNode.id) return;

    const conn = globalConnections.find(c => 
        (c.from == last.id && c.to == targetNode.id) || (c.to == last.id && c.from == targetNode.id)
    );

    const isTargetIsolated = !globalConnections.some(c => c.from == targetNode.id || c.to == targetNode.id);
    const isLastIsolated = !globalConnections.some(c => c.from == last.id || c.to == last.id);

    if (conn || isTargetIsolated || isLastIsolated) {
        const absX1 = (last.x / 100) * MAP_SIZE;
        const absY1 = (last.y / 100) * MAP_SIZE;
        const dist = Math.sqrt(Math.pow(absX2 - absX1, 2) + Math.pow(absY2 - absY1, 2));

        if (conn) {
            const type = conn.type || Object.values(conn)[2] || '0';
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

        routeNodes.push(targetNode);
        updateRouteUI();
    }
}

function updateTransform() {
    mapGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
    if (zoomLevelText) zoomLevelText.textContent = scale.toFixed(2);
    
    if (scale <= 0.90) {
        planetsLayer.classList.add('hide-labels');
        objectsLayer.classList.add('hide-labels');
    } else {
        planetsLayer.classList.remove('hide-labels');
        objectsLayer.classList.remove('hide-labels');
    }
}

function flyTo(x, y, targetScale = 2) {
    if (activeFlyToId !== null) {
        cancelAnimationFrame(activeFlyToId);
        activeFlyToId = null;
    }

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

        if (progress < 1) {
            activeFlyToId = requestAnimationFrame(animate);
        } else {
            activeFlyToId = null;
        }
    }
    activeFlyToId = requestAnimationFrame(animate);
}

// ==========================================
// ОБРАБОТЧИКИ СОБЫТИЙ МЫШИ И ТАЧА
// ==========================================
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
    const newScale = Math.max(0.1, Math.min(scale * zoomFactor, 8)); 
    const actualZoomFactor = newScale / scale;

    translateX = mouseX - (mouseX - translateX) * actualZoomFactor;
    translateY = mouseY - (mouseY - translateY) * actualZoomFactor;
    scale = newScale;
    updateTransform();
}, { passive: false });

let initialPinchDistance = null;
let initialScale = 1;

function getPinchDistance(touches) {
    return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
    );
}

function getPinchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
    } else if (e.touches.length === 2) {
        isDragging = false; 
        initialPinchDistance = getPinchDistance(e.touches);
        initialScale = scale;
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDragging) {
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - startY;
        updateTransform();
    } else if (e.touches.length === 2 && initialPinchDistance) {
        e.preventDefault(); 
        
        const currentDistance = getPinchDistance(e.touches);
        const zoomFactor = currentDistance / initialPinchDistance;
        const newScale = Math.max(0.1, Math.min(initialScale * zoomFactor, 8));

        const center = getPinchCenter(e.touches);
        const rect = svg.getBoundingClientRect();
        const mouseX = center.x - rect.left;
        const mouseY = center.y - rect.top;

        const actualZoomFactor = newScale / scale;

        translateX = mouseX - (mouseX - translateX) * actualZoomFactor;
        translateY = mouseY - (mouseY - translateY) * actualZoomFactor;
        scale = newScale;
        
        updateTransform();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }
    if (e.touches.length === 0) {
        isDragging = false;
    } else if (e.touches.length === 1) {
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
    }
});

// ==========================================
// ИНИЦИАЛИЗАЦИЯ И РЕНДЕР КАРТЫ
// ==========================================
function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, complete: results => resolve(results.data), error: err => reject(err) });
    });
}

tooltip.addEventListener('click', (e) => e.stopPropagation());

// Оптимизированный помощник для ключей ребер Вороного
function getEdgeKey(p1, p2) {
    let pt1, pt2;
    if (p1[0] < p2[0] - 0.001 || (Math.abs(p1[0] - p2[0]) <= 0.001 && p1[1] < p2[1])) {
        pt1 = p1; pt2 = p2;
    } else {
        pt1 = p2; pt2 = p1;
    }
    return `${pt1[0].toFixed(2)},${pt1[1].toFixed(2)}-${pt2[0].toFixed(2)},${pt2[1].toFixed(2)}`;
}

async function initMap() {
    try {
        const [planetsData, connectionsData, objectsData] = await Promise.all([
            fetchCSV(PLANETS_CSV_URL), 
            fetchCSV(CONNECTIONS_CSV_URL),
            fetchCSV(OBJECTS_CSV_URL)
        ]);
        
        planetsList = planetsData.filter(p => p.id).map(p => {
            const factionName = p.faction ? p.faction.trim() : "";
            p.faction = (!factionName || !factionsData[factionName]) ? "Нейтральные Системы" : factionName;
            return p;
        });

        globalConnections = connectionsData.filter(c => c.from && c.to);
        planetsList.forEach(p => { planetMap[p.id] = p; });

        buildLegend();

        translateX = window.innerWidth / 2 - (MAP_SIZE / 2) * 0.3;
        translateY = window.innerHeight / 2 - (MAP_SIZE / 2) * 0.3;
        scale = 0.3;
        updateTransform();

        const points = planetsList.map(p => [(p.x / 100) * MAP_SIZE, (p.y / 100) * MAP_SIZE]);
        const delaunay = d3.Delaunay.from(points);
        const voronoi = delaunay.voronoi([0, 0, MAP_SIZE, MAP_SIZE]);

        let defGroup = svg.querySelector('defs');
        if (!defGroup) {
            defGroup = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defGroup);
        }

        const edges = new Map();
        planetsList.forEach((p, i) => {
            const poly = voronoi.cellPolygon(i);
            if (!poly) return;
            for (let j = 0; j < poly.length - 1; j++) {
                const key = getEdgeKey(poly[j], poly[j+1]);
                if (!edges.has(key)) edges.set(key, []);
                edges.get(key).push({ cell: i, p1: poly[j], p2: poly[j+1] });
            }
        });

        const voronoiFrag = document.createDocumentFragment();
        const voronoiRegionFrag = document.createDocumentFragment();
        const defsFrag = document.createDocumentFragment();

        planetsList.forEach((planet, i) => {
            const pathData = voronoi.renderCell(i);
            if (!pathData) return;
            
            const factionInfo = factionsData[planet.faction];
            const isNeutral = (planet.faction === "Нейтральные Системы");

            // 1. Политический слой
            const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clip.setAttribute('id', `clip-cell-${i}`);
            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            clipPath.setAttribute('d', pathData);
            clip.appendChild(clipPath);
            defsFrag.appendChild(clip);

            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            bg.setAttribute('d', pathData);
            bg.setAttribute('class', 'voronoi-bg');
            if (isNeutral) {
                bg.style.fill = "transparent";
                bg.style.stroke = "none";
            } else {
                bg.style.fill = factionInfo.secondaryColor;
                bg.style.stroke = factionInfo.secondaryColor;
                bg.style.strokeWidth = "1px"; 
            }
            voronoiFrag.appendChild(bg);

            // 2. Слой Регионов
            const regionCode = String(planet.region || "0").trim();
            const rColor = regionColors[regionCode];
            
            const rBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            rBg.setAttribute('d', pathData);
            rBg.setAttribute('class', 'voronoi-region-bg');
            
            if (!rColor || regionCode === "0") {
                rBg.style.fill = "transparent";
                rBg.style.stroke = "none";
            } else {
                rBg.style.fill = rColor;
                rBg.style.stroke = rColor;
                rBg.style.strokeWidth = "2.5px"; 
                rBg.setAttribute('stroke-linejoin', 'round');
            }
            voronoiRegionFrag.appendChild(rBg);

            let borderPath = "";
            let innerPath = ""; 

            const poly = voronoi.cellPolygon(i);
            if (!isNeutral && poly) {
                for (let j = 0; j < poly.length - 1; j++) {
                    const p1 = poly[j];
                    const p2 = poly[j+1];
                    const key = getEdgeKey(p1, p2);
                    
                    const edgeData = edges.get(key);
                    let isBorder = false;
                    
                    if (edgeData.length === 1) {
                        isBorder = true;
                    } else {
                        const otherCellInfo = edgeData.find(e => e.cell !== i);
                        if (otherCellInfo && planetsList[otherCellInfo.cell].faction !== planet.faction) {
                            isBorder = true;
                        }
                    }

                    if (isBorder) {
                        borderPath += `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} `;
                    } else {
                        innerPath += `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} `;
                    }
                }
            }

            if (innerPath) {
                const innerBorder = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                innerBorder.setAttribute('d', innerPath);
                innerBorder.style.stroke = factionInfo.secondaryColor;
                innerBorder.style.fill = "none";
                innerBorder.style.strokeWidth = "2.5"; 
                voronoiFrag.appendChild(innerBorder);
            }

            if (borderPath) {
                const border = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                border.setAttribute('d', borderPath);
                border.setAttribute('class', 'voronoi-border');
                border.style.stroke = factionInfo.mainColor;
                border.style.fill = "none";
                border.setAttribute('clip-path', `url(#clip-cell-${i})`);
                border.style.strokeWidth = "3"; 
                voronoiFrag.appendChild(border);
            }
        });

        defGroup.appendChild(defsFrag);
        voronoiLayer.appendChild(voronoiFrag);
        voronoiRegionLayer.appendChild(voronoiRegionFrag);

        const connectionsFrag = document.createDocumentFragment();
        globalConnections.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];
            const routeType = conn.type || Object.values(conn)[2]; 
            
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
                connectionsFrag.appendChild(line);
            }
        });
        connectionsLayer.appendChild(connectionsFrag);

        const planetsFrag = document.createDocumentFragment();
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
            hoverRing.setAttribute('r', '5');
            hoverRing.setAttribute('fill', 'none');
            hoverRing.setAttribute('stroke', '#ffcc00');
            hoverRing.setAttribute('stroke-width', '1');
            hoverRing.setAttribute('stroke-dasharray', '5.854 2'); 
            hoverRing.setAttribute('stroke-dashoffset', '6.854');
            hoverRing.setAttribute('class', 'hover-ring');
            hoverRing.style.display = 'none';
            group.appendChild(hoverRing);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', absX);
            circle.setAttribute('cy', absY);
            circle.setAttribute('r', '2.75'); 
            circle.setAttribute('fill', color);
            circle.setAttribute('class', 'planet-circle');
            group.appendChild(circle);

            const fontSize = 3.5;
            const estTextWidth = planet.name.length * 2.7; 
            const paddingX = 2;
            const paddingY = 0.5;
            const rectWidth = estTextWidth + paddingX * 2;
            const rectHeight = fontSize + paddingY * 2;

            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            textBg.setAttribute('x', absX - rectWidth / 2);
            textBg.setAttribute('y', absY + 3.5);
            textBg.setAttribute('width', rectWidth);
            textBg.setAttribute('height', rectHeight);
            textBg.setAttribute('rx', '0.75');
            textBg.setAttribute('class', 'planet-label-bg');
            group.appendChild(textBg);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = planet.name;
            text.setAttribute('x', absX);
            text.setAttribute('y', absY + 7); 
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');
            text.style.setProperty('--faction-color', color);
            
            const rCode = String(planet.region || "0").trim();
            const rColorText = regionColors[rCode] || "#cccccc"; 
            text.style.setProperty('--region-color', rColorText);
            
            group.appendChild(text);

            circle.addEventListener('mouseover', (e) => {
                hoverRing.style.display = 'block';
                if (hoverCoords) {
                    hoverCoords.textContent = `X: ${planet.x} | Y: ${planet.y}`;
                    hoverCoords.style.left = `${e.pageX + 15}px`;
                    hoverCoords.style.top = `${e.pageY - 15}px`;
                    hoverCoords.style.display = 'block';
                }
            });

            circle.addEventListener('mouseout', () => {
                hoverRing.style.display = 'none';
                if (hoverCoords) hoverCoords.style.display = 'none';
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
                    
                    ttWiki.style.display = 'block';
                    if (planet.wiki && planet.wiki.trim() !== "") {
                        ttWiki.href = planet.wiki;
                        ttWiki.classList.remove('disabled');
                    } else {
                        ttWiki.removeAttribute('href');
                        ttWiki.classList.add('disabled');
                    }

                    tooltip.style.left = `${e.pageX + 15}px`;
                    tooltip.style.top = `${e.pageY + 15}px`;
                    tooltip.style.display = 'block';

                    flyTo(absX, absY, scale);
                }
            });

            planetsFrag.appendChild(group);
        });
        planetsLayer.appendChild(planetsFrag);

        const createdMasks = new Set();
        const objectsFrag = document.createDocumentFragment();

        objectsData.forEach(obj => {
            if (!obj.id) return;
            const absX = (obj.x / 100) * MAP_SIZE;
            const absY = (obj.y / 100) * MAP_SIZE;
            const typeLower = (obj.type || "").toLowerCase();

            let color = "#FFFFFF";
            let iconPath = "";
            let iconId = "";
            let badgeText = "Особый объект";

            if (typeLower.includes("пират")) {
                color = "#AF2B1E";
                iconPath = "assets/pirate.png";
                iconId = "mask-pirate";
                badgeText = "Пиратская база";
            } else if (typeLower.includes("точка")) {
                color = "#FFBF00";
                iconPath = "assets/point.png";
                iconId = "mask-point";
                badgeText = "Точка интереса";
            } else {
                return; 
            }

            if (!createdMasks.has(iconId) && !document.getElementById(iconId)) {
                const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
                mask.setAttribute('id', iconId);
                const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                img.setAttribute('href', iconPath);
                img.setAttribute('width', '10');
                img.setAttribute('height', '10');
                img.setAttribute('x', '-5');
                img.setAttribute('y', '-5');
                mask.appendChild(img);
                defGroup.appendChild(mask);
                createdMasks.add(iconId);
            }

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('transform', `translate(${absX}, ${absY})`);
            group.setAttribute('class', 'map-object-group'); 

            const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pulse.setAttribute('class', 'object-pulse');
            pulse.style.stroke = color;
            pulse.setAttribute('cx', '0');
            pulse.setAttribute('cy', '0');
            pulse.setAttribute('r', '5'); 
            group.appendChild(pulse);

            const iconRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            iconRect.setAttribute('x', '-5');
            iconRect.setAttribute('y', '-5');
            iconRect.setAttribute('width', '10');
            iconRect.setAttribute('height', '10');
            iconRect.setAttribute('fill', color);
            iconRect.setAttribute('mask', `url(#${iconId})`);
            iconRect.setAttribute('class', 'map-object-icon');
            group.appendChild(iconRect);

            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hitArea.setAttribute('cx', '0');
            hitArea.setAttribute('cy', '0');
            hitArea.setAttribute('r', '7');
            hitArea.setAttribute('fill', 'transparent');
            group.appendChild(hitArea);

            const fontSize = 3.5;
            const estTextWidth = obj.name.length * 2.7; 
            const paddingX = 2;
            const paddingY = 0.5;
            const rectWidth = estTextWidth + paddingX * 2;
            const rectHeight = fontSize + paddingY * 2;

            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            textBg.setAttribute('x', -rectWidth / 2);
            textBg.setAttribute('y', '6');
            textBg.setAttribute('width', rectWidth);
            textBg.setAttribute('height', rectHeight);
            textBg.setAttribute('rx', '1.5');
            textBg.setAttribute('class', 'planet-label-bg');
            group.appendChild(textBg);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = obj.name;
            text.setAttribute('x', '0');
            text.setAttribute('y', '9.5'); 
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');
            text.style.fill = color; 
            text.style.setProperty('--faction-color', color); 
            text.style.setProperty('--region-color', color); 
            group.appendChild(text);

            group.addEventListener('mouseover', (e) => {
                if (hoverCoords) {
                    hoverCoords.textContent = `X: ${obj.x} | Y: ${obj.y}`;
                    hoverCoords.style.left = `${e.pageX + 15}px`;
                    hoverCoords.style.top = `${e.pageY - 15}px`;
                    hoverCoords.style.display = 'block';
                }
            });

            group.addEventListener('mouseout', () => {
                if (hoverCoords) hoverCoords.style.display = 'none';
            });

            group.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (isRoutingMode) {
                    handleRouteClick(obj);
                } else {
                    ttTitle.textContent = obj.name;
                    ttInfo.textContent = obj.info;
                    ttFactionBadge.textContent = badgeText;
                    ttFactionBadge.style.color = color;
                    
                    tooltip.style.borderColor = color; 
                    ttWiki.style.display = 'none'; 

                    tooltip.style.left = `${e.pageX + 15}px`;
                    tooltip.style.top = `${e.pageY + 15}px`;
                    tooltip.style.display = 'block';

                    flyTo(absX, absY, scale);
                }
            });

            objectsFrag.appendChild(group);
        });
        objectsLayer.appendChild(objectsFrag);

        svg.addEventListener('click', () => { tooltip.style.display = 'none'; });
        setupSearch();

        if (window.innerWidth <= 768) {
            const legendPanel = document.getElementById('legend');
            const legendContent = document.getElementById('faction-legend');
            const legendArrow = document.getElementById('legend-arrow');
            if (legendPanel && legendContent && legendArrow) {
                legendPanel.classList.add('collapsed');
                legendContent.style.display = 'none';
                legendArrow.textContent = '▶';
            }
        }

    } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
    }
}

// ==========================================
// ЛОГИКА ПОИСКА
// ==========================================
function setupSearch() {
    const searchInput = document.getElementById('planet-search');
    const resultsDiv = document.getElementById('search-results');
    const btnSearchToggle = document.getElementById('btn-search-toggle');
    const searchWrap = document.getElementById('search-wrap');

    if (btnSearchToggle && searchWrap) {
        btnSearchToggle.addEventListener('click', () => {
            searchWrap.classList.toggle('active');
            btnSearchToggle.classList.toggle('active');
            
            if (searchWrap.classList.contains('active')) {
                searchInput.focus();
            } else {
                searchInput.value = '';
                resultsDiv.style.display = 'none';
            }
        });
    }

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        resultsDiv.innerHTML = '';
        if (!val) { resultsDiv.style.display = 'none'; return; }

        const matches = planetsList.filter(p => p.name.toLowerCase().includes(val));
        
        if (matches.length > 0) {
            resultsDiv.style.display = 'block';
            const frag = document.createDocumentFragment();

            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.textContent = match.name;
                div.onclick = () => {
                    searchInput.value = '';
                    resultsDiv.style.display = 'none';
                    
                    if (searchWrap && searchWrap.classList.contains('active')) {
                        searchWrap.classList.remove('active');
                        if (btnSearchToggle) btnSearchToggle.classList.remove('active');
                    }

                    const absX = (match.x / 100) * MAP_SIZE;
                    const absY = (match.y / 100) * MAP_SIZE;
                    flyTo(absX, absY, 3);
                };
                frag.appendChild(div);
            });
            resultsDiv.appendChild(frag);
        } else {
            resultsDiv.style.display = 'none';
        }
    });
}

initMap();
