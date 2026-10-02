docker compose logs -f spotify # дивитись логи
docker compose ps # статус
docker compose down # зупинити (volume з БД ЛИШАЄТЬСЯ)
docker compose up -d --build # підняти знову

docker compose logs -f --tail=200

docker logs spotify 2>&1 | Select-String '"level":(50|60)' # тільки помилки (level 50 = error, 60 = fatal):

abaoba 42 Чувапчічі

TODO
Dozzle (мінімальний контейнер з веб-UI) для логів перегляду
