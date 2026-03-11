const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const MAP_SIZE = 4000;

const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group');
const connectionsLayer = document.getElementById('connections-layer');
const planetsLayer = document.getElementById('planets-layer');

const tooltip = document.getElementById('tooltip');
const hoverTooltip = document.getElementById('hover-tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const ttFactionBadge = document.getElementById('tt-faction-badge');
const coordX = document.getElementById('coord-x');
const coordY = document.getElementById('coord-y');
const zoomLevelText = document.getElementById('zoom-level');

let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

let planetsList = [];
let planetMap = {};

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
    const rect = svg.getBoundingClientRect();
    const mapX = (e.clientX - rect.left - translateX) / scale;
    const mapY = (e.clientY - rect.top - translateY) / scale;
    coordX.textContent = Math.round(mapX).toString().padStart(4, '0');
    coordY.textContent = Math.round(mapY).toString().padStart(4, '0');

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
        const [planetsData, connectionsData] = await Promise.all([fetchCSV(PLANETS_CSV_URL), fetchCSV(CONNECTIONS_CSV_URL)]);
        planetsList = planetsData.filter(p => p.id);
        const connections = connectionsData.filter(c => c.from && c.to);
        
        planetsList.forEach(p => planetMap[p.id] = p);

        translateX = window.innerWidth / 2 - (MAP_SIZE / 2) * 0.3;
        translateY = window.innerHeight / 2 - (MAP_SIZE / 2) * 0.3;
        scale = 0.3;
        updateTransform();

        connections.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];
            
            // Получаем значение из 3-го столбца (Столбец C)
            const routeType = Object.values(conn)[2]; 
            
            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', (p1.x / 100) * MAP_SIZE);
                line.setAttribute('y1', (p1.y / 100) * MAP_SIZE);
                line.setAttribute('x2', (p2.x / 100) * MAP_SIZE);
                line.setAttribute('y2', (p2.y / 100) * MAP_SIZE);
                line.setAttribute('class', 'connection');
                
                // Назначаем цвет в зависимости от буквы
                let routeColor = 'rgba(150, 150, 150, 0.4)'; // По умолчанию 0 (серый)
                if (routeType === 'V') routeColor = 'rgba(138, 43, 226, 0.7)'; // Фиолетовый
                else if (routeType === 'G') routeColor = 'rgba(46, 204, 113, 0.7)'; // Зеленый
                else if (routeType === 'Y') routeColor = 'rgba(241, 196, 15, 0.7)'; // Желтый
                else if (routeType === 'R') routeColor = 'rgba(231, 76, 60, 0.7)'; // Красный
                else if (routeType === 'B') routeColor = 'rgba(52, 152, 219, 0.7)'; // Голубой
                
                line.style.stroke = routeColor; // Применяем цвет напрямую к элементу
                connectionsLayer.appendChild(line);
            }
        });

        planetsList.forEach(planet => {
            const absX = (planet.x / 100) * MAP_SIZE;
            const absY = (planet.y / 100) * MAP_SIZE;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            let color = '#a0a0a0';
            let badgeColor = '#a0a0a0';

            if (planet.faction === 'Галактическая Республика') {
                color = '#ff3333'; badgeColor = '#551111';
            } else if (planet.faction === 'Конфедерация Независимых Систем') {
                color = '#3388ff'; badgeColor = '#112255';
            }

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', absX);
            circle.setAttribute('cy', absY);
            circle.setAttribute('r', 5.5); // Уменьшено на 30% (было 8)
            circle.setAttribute('fill', color);
            circle.setAttribute('class', 'planet-circle');

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = planet.name;
            text.setAttribute('x', absX);
            text.setAttribute('y', absY + 18); // Опущено пропорционально новому размеру планеты
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'planet-label');

            circle.addEventListener('mouseover', (e) => {
                hoverTooltip.textContent = planet.name; // Только название
                hoverTooltip.style.left = `${e.pageX + 15}px`;
                hoverTooltip.style.top = `${e.pageY - 25}px`;
                hoverTooltip.style.borderColor = color;
                hoverTooltip.style.display = 'block';
            });

            circle.addEventListener('mouseout', () => hoverTooltip.style.display = 'none');

            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                hoverTooltip.style.display = 'none';
                
                ttTitle.textContent = planet.name;
                ttTitle.style.color = color;
                ttInfo.textContent = planet.info;
                ttFactionBadge.textContent = planet.faction || 'Нейтрально';
                ttFactionBadge.style.backgroundColor = badgeColor;
                ttFactionBadge.style.color = color;
                ttFactionBadge.style.border = `1px solid ${color}`;
                
                tooltip.style.left = `${e.pageX + 15}px`;
                tooltip.style.top = `${e.pageY + 15}px`;
                tooltip.style.display = 'block';

                flyTo(absX, absY, scale);
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

