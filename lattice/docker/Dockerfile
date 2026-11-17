FROM alpine:3.20
WORKDIR /data
COPY opencode2api-linux-amd64 /app/opencode2api
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/opencode2api /app/entrypoint.sh
ENV PORT=8133 API_KEY=Lattice WARP=true
EXPOSE 8133
ENTRYPOINT ["/app/entrypoint.sh"]
