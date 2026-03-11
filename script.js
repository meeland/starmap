// Вставьте сюда ваши ссылки на CSV из Google Sheets
const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv
';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv
';

const svg = document.getElementById('starmap');
const tooltip = document.getElementById('tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');

// Функция для парсинга CSV через Promise
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

async function initMap() {
    try {
        // Загружаем данные параллельно
        const [planetsData, connectionsData] = await Promise.all([
            fetchCSV(PLANETS_CSV_URL),
            fetchCSV(CONNECTIONS_CSV_URL)
        ]);

        // Фильтруем пустые строки, которые могут прийти из Sheets
        const planets = planetsData.filter(p => p.id);
        const connections = connectionsData.filter(c => c.from && c.to);

        // Создаем словарь планет для быстрого доступа по ID
        const planetMap = {};
        planets.forEach(p => {
            planetMap[p.id] = p;
        });

        // 1. Сначала рисуем линии (чтобы они были под планетами)
        connections.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];

            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', `${p1.x}%`);
                line.setAttribute('y1', `${p1.y}%`);
                line.setAttribute('x2', `${p2.x}%`);
                line.setAttribute('y2', `${p2.y}%`);
                line.setAttribute('class', 'connection');
                svg.appendChild(line);
            }
        });

        // 2. Рисуем планеты как текстовые элементы "✦"
        planets.forEach(planet => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = '✦';
            text.setAttribute('x', `${planet.x}%`);
            text.setAttribute('y', `${planet.y}%`);
            text.setAttribute('text-anchor', 'middle'); // Центрируем символ
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('class', 'planet');

            // Обработка клика по планете
            text.addEventListener('click', (e) => {
                // Предотвращаем закрытие при клике на саму планету
                e.stopPropagation(); 
                
                ttTitle.textContent = planet.name;
                ttInfo.textContent = planet.info;
                
                // Позиционируем окно рядом с курсором
                tooltip.style.left = `${e.pageX + 15}px`;
                tooltip.style.top = `${e.pageY + 15}px`;
                tooltip.style.display = 'block';
            });

            svg.appendChild(text);
        });

        // Закрываем окно при клике на пустое место (на svg контейнер)
        svg.addEventListener('click', () => {
            tooltip.style.display = 'none';
        });

    } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
    }
}

// Запускаем отрисовку

initMap();
