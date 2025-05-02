from .games import games_bp
from .admin import admin_bp
from .preferences import preferences_bp
from .store import store_bp

def register_blueprints(app):
    app.register_blueprint(games_bp, url_prefix='/api')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(preferences_bp, url_prefix='/api/prefs')
    app.register_blueprint(store_bp, url_prefix='/api/store')
