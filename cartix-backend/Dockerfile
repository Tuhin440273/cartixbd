FROM php:8.4-cli

COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN apt-get update && apt-get install -y git unzip \
    && install-php-extensions pdo_pgsql pdo_mysql zip gd intl bcmath exif

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction \
    && chmod -R 775 storage bootstrap/cache

CMD php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT:-10000}
CMD php artisan storage:link || true; php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${PORT:-10000}
