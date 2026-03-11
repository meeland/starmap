// ВАЖНО: Вставьте ваши актуальные ссылки на опубликованные CSV файлы
const PLANETS_CSV_URL = 'ВАША_ССЫЛКА_CSV_PLANETS';
const CONNECTIONS_CSV_URL = 'ВАША_ССЫЛКА_CSV_CONNECTIONS';

const svg = document.getElementById('starmap');
const tooltip = document.getElementById('tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const mapContainer = document.getElementById('map-container');
const routePanel = document.getElementById('route-panel');
const btnToggleRoute = document.getElementById('btn-toggle-route');

// Состояние карты и маршрутов
let connectionsList = [];
let isRoutingMode = false;
let routeNodes = [];
let routeLines = []; // Храним отрисованные линии маршрута
let distType0 = 0;
let distTypeColor = 0;
let distOffPath = 0;

// Чтение CSV
function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            complete: results => resolve(results.data),
            error: err => reject(err)
        });
    });
}

// Евклидово расстояние
function calculateDistance(p1, p2) {
    const dx = parseFloat(p1.x) - parseFloat(p2.x);
    const dy = parseFloat(p1.y) - parseFloat(p2.y);
    return Math.sqrt(dx * dx + dy * dy);
}

// Обновление интерфейса маршрутизатора
function updateRouteUI() {
    document.getElementById('route-dist-0').textContent = distType0.toFixed(1);
    document.getElementById('route-dist-color').textContent = distTypeColor.toFixed(1);
    document.getElementById('route-dist-off').textContent = distOffPath.toFixed(1);
    document.getElementById('route-points').textContent = routeNodes.length;
}

// Сброс маршрута
function resetRoute() {
    routeNodes = [];
    distType0 = 0;
    distTypeColor = 0;
    distOffPath = 0;
    updateRouteUI();
    
    // Удаляем временные линии маршрута с карты
    routeLines.forEach(line => line.remove());
    routeLines = [];
}

// Управление кнопками
btnToggleRoute.addEventListener('click', () => {
    isRoutingMode = !isRoutingMode;
    routePanel.style.display = isRoutingMode ? 'block' : 'none';
    btnToggleRoute.style.backgroundColor = isRoutingMode ? '#2b303b' : '#181a20';
    
    if (isRoutingMode) {
        mapContainer.classList.add('routing-mode-active');
    } else {
        mapContainer.classList.remove('routing-mode-active');
        resetRoute();
    }
});

document.getElementById('btn-reset-route').addEventListener('click', resetRoute);

// Отрисовка временной линии
function drawRouteLine(p1, p2) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${p1.x}%`);
    line.setAttribute('y1', `${p1.y}%`);
    line.setAttribute('x2', `${p2.x}%`);
    line.setAttribute('y2', `${p2.y}%`);
    line.setAttribute('class', 'route-line');
    svg.appendChild(line);
    routeLines.push(line);
}

// Основная логика инициализации
async function initMap() {
    try {
        const [planetsData, connectionsData] = await Promise.all([
            fetchCSV(PLANETS_CSV_URL),
            fetchCSV(CONNECTIONS_CSV_URL)
        ]);

        const planets = planetsData.filter(p => p.id);
        connectionsList = connectionsData.filter(c => c.from && c.to);

        const planetMap = {};
        planets.forEach(p => { planetMap[p.id] = p; });

        // 1. Отрисовка базовых линий связей
        connectionsList.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];

            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', `${p1.x}%`);
                line.setAttribute('y1', `${p1.y}%`);
                line.setAttribute('x2', `${p2.x}%`);
                line.setAttribute('y2', `${p2.y}%`);
                line.setAttribute('class', 'connection');
                // Если нужно раскрашивать дороги на карте, можно добавлять классы на основе conn.type
                svg.appendChild(line);
            }
        });

        // 2. Отрисовка планет
        planets.forEach(planet => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = '✦';
            text.setAttribute('x', `${planet.x}%`);
            text.setAttribute('y', `${planet.y}%`);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('class', 'planet');

            // Обработка клика
            text.addEventListener('click', (e) => {
                e.stopPropagation();

                if (isRoutingMode) {
                    // --- ЛОГИКА МАРШРУТИЗАЦИИ ---
                    if (routeNodes.length === 0) {
                        routeNodes.push(planet);
                        updateRouteUI();
                        return;
                    }

                    const lastNode = routeNodes[routeNodes.length - 1];
                    
                    // Ищем связь
                    const connection = connectionsList.find(c => 
                        (c.from == lastNode.id && c.to == planet.id) || 
                        (c.to == lastNode.id && c.from == planet.id)
                    );

                    // Проверяем, есть ли у целевого мира пути вообще
                    const targetHasAnyConnections = connectionsList.some(c => 
                        c.from == planet.id || c.to == planet.id
                    );

                    // Условие: путь есть ИЛИ целевой мир полностью изолирован
                    if (connection || !targetHasAnyConnections) {
                        const dist = calculateDistance(lastNode, planet);
                        
                        if (connection) {
                            // Проверка типа пути (если тип не указан, считаем его '0' по умолчанию)
                            const pathType = connection.type || '0';
                            
                            if (pathType === '0') {
                                distType0 += dist;
                            } else if (['V', 'G', 'Y', 'R', 'B'].includes(pathType)) {
                                distTypeColor += dist;
                            }
                        } else if (!targetHasAnyConnections) {
                            distOffPath += dist;
                        }

                        routeNodes.push(planet);
                        updateRouteUI();
                        drawRouteLine(lastNode, planet);
                    }
                } else {
                    // --- ЛОГИКА ИНФОРМАЦИОННОГО ОКНА ---
                    ttTitle.textContent = planet.name;
                    ttInfo.textContent = planet.info;
                    
                    tooltip.style.left = `${e.pageX + 15}px`;
                    tooltip.style.top = `${e.pageY + 15}px`;
                    tooltip.style.display = 'block';
                }
            });

            svg.appendChild(text);
        });

        // Закрываем окно при клике на пустое место
        svg.addEventListener('click', () => {
            if (!isRoutingMode) {
                tooltip.style.display = 'none';
            }
        });

    } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
    }
}

initMap();
