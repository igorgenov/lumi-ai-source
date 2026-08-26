FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up cargo cache directory with proper permissions
RUN mkdir -p /root/.cargo/registry/cache && \
    mkdir -p /root/.cargo/registry/index

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies with proper cargo cache
ENV CARGO_HOME=/root/.cargo
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
