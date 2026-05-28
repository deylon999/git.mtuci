import time
from collections import deque, defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, List


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware для сбора метрик HTTP запросов"""

    # Классовая переменная для хранения единственного экземпляра
    _instance = None

    def __init__(self, app):
        super().__init__(app)
        # Храним последние 1000 запросов для расчета P95
        self.response_times: deque = deque(maxlen=1000)
        # Счетчики за последний час
        self.requests_total = 0
        self.requests_errors = 0
        self.request_timestamps: deque = deque(maxlen=10000)  # Для RPS
        self.start_time = time.time()
        # Сохраняем ссылку на экземпляр
        MetricsMiddleware._instance = self

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        status_code = 500  # Default error

        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            # Записываем время ответа
            response_time = (time.time() - start_time) * 1000  # в миллисекундах
            self.response_times.append(response_time)

            # Обновляем счетчики
            self.requests_total += 1
            if status_code >= 400:
                self.requests_errors += 1

            # Записываем timestamp для RPS
            self.request_timestamps.append(time.time())

            # Очищаем старые timestamps (старше часа)
            current_time = time.time()
            while self.request_timestamps and current_time - self.request_timestamps[0] > 3600:
                self.request_timestamps.popleft()
                self.requests_total -= 1

    def get_metrics(self) -> Dict:
        """Возвращает собранные метрики"""
        current_time = time.time()

        # Количество запросов за последний час
        requests_hour = len(self.request_timestamps)

        # Количество ошибок за последний час (оцениваем пропорционально)
        error_rate = self.requests_errors / self.requests_total if self.requests_total > 0 else 0
        errors_hour = int(requests_hour * error_rate)

        # Среднее время ответа
        avg_response = sum(self.response_times) / len(self.response_times) if self.response_times else 0

        # P95 время ответа
        sorted_times = sorted(self.response_times)
        p95_index = int(len(sorted_times) * 0.95)
        p95_response = sorted_times[p95_index] if sorted_times else 0

        # RPS (запросы в секунду за последнюю минуту)
        one_minute_ago = current_time - 60
        requests_last_minute = sum(1 for t in self.request_timestamps if t > one_minute_ago)
        rps = requests_last_minute / 60 if requests_last_minute > 0 else 0

        return {
            "requests_total_hour": requests_hour,
            "requests_errors_hour": errors_hour,
            "avg_response_ms": round(avg_response, 1),
            "p95_response_ms": round(p95_response, 1),
            "error_rate": round(error_rate * 100, 1),
            "rps": round(rps, 1),
        }


def get_http_metrics() -> Dict:
    """Возвращает метрики HTTP запросов"""
    if MetricsMiddleware._instance:
        return MetricsMiddleware._instance.get_metrics()
    return {
        "requests_total_hour": None,
        "requests_errors_hour": None,
        "avg_response_ms": None,
        "p95_response_ms": None,
        "error_rate": None,
        "rps": None,
    }


def get_prometheus_metrics_text() -> str:
    m = get_http_metrics()
    lines = [
        "# HELP app_http_requests_hour Number of HTTP requests in the last hour",
        "# TYPE app_http_requests_hour gauge",
        f"app_http_requests_hour {m['requests_total_hour'] or 0}",
        "# HELP app_http_errors_hour Number of HTTP errors in the last hour",
        "# TYPE app_http_errors_hour gauge",
        f"app_http_errors_hour {m['requests_errors_hour'] or 0}",
        "# HELP app_http_p95_ms HTTP p95 latency in milliseconds",
        "# TYPE app_http_p95_ms gauge",
        f"app_http_p95_ms {m['p95_response_ms'] or 0}",
        "# HELP app_http_rps Requests per second over the last minute",
        "# TYPE app_http_rps gauge",
        f"app_http_rps {m['rps'] or 0}",
    ]
    return "\n".join(lines) + "\n"
