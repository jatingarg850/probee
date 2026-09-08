# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm AS runtime

RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY server/requirements.txt /tmp/server-req.txt
RUN pip install --no-cache-dir -r /tmp/server-req.txt

COPY --chown=app:app server/src /app/server/src

ENV ITINERARY_DB_PATH=/tmp/itinerary.db

USER app

EXPOSE 8000
CMD ["python", "/app/server/src/server.py"]
