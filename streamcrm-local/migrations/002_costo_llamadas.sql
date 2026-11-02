-- v1.0: costo de cada llamada de Retell (USD) para que el dueño vea cuánto gasta en avisos.
ALTER TABLE calls ADD COLUMN cost REAL;
