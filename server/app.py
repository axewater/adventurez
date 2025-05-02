import os, uuid
from flask import Flask, jsonify, send_from_directory, render_template
import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_cors import CORS
from config import config

db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'
migrate = Migrate()

cors = CORS()

client_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'client'))
uploads_folder = os.path.abspath(os.path.join(client_folder, 'uploads'))

def create_app(config_name='default'):
    template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'client', 'templates'))

    app = Flask(__name__,
                instance_relative_config=True,
                instance_path=config[config_name].INSTANCE_FOLDER_PATH,
                static_folder=None,
                template_folder=template_dir)

    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    login_manager.init_app(app)

    db.init_app(app)

    from models import User, AnonymousUser, metadata as models_metadata
    migrate.init_app(app, db, metadata=models_metadata)
    from flask_login import login_required
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    login_manager.anonymous_user = AnonymousUser

    # Context processor to inject 'now' function into templates
    @app.context_processor
    def inject_now():
        return {'now': datetime.datetime.utcnow}

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, uuid.UUID(user_id))

    @app.route('/')
    @login_required
    def index():
        # Pass the app version to the template context
        app_version = app.config.get('APP_VERSION', 'N/A')
        return render_template('index.html', app_version=app_version)

    @app.route('/<path:filename>')
    def serve_static(filename):
        return send_from_directory(client_folder, filename)

    @login_required
    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        if '..' in filename or filename.startswith('/'):
            return jsonify({"error": "Invalid file path"}), 400
        
        return send_from_directory(uploads_folder, filename)

    @app.route('/api/status')
    def api_status():
        return jsonify({"status": "API is running"}), 200

    from api.games import games_bp
    app.register_blueprint(games_bp, url_prefix='/api/games')
    from api.rooms import rooms_bp
    app.register_blueprint(rooms_bp, url_prefix='/api')
    from api.connections import connections_bp
    app.register_blueprint(connections_bp, url_prefix='/api')
    from api.entities import entities_bp
    from auth import auth_bp
    app.register_blueprint(entities_bp, url_prefix='/api')
    from api.scripts import scripts_bp
    app.register_blueprint(scripts_bp, url_prefix='/api')
    from api.play.routes import play_bp
    app.register_blueprint(play_bp)
    from api.conversations import conversations_bp
    app.register_blueprint(conversations_bp, url_prefix='/api')
    from api.files import files_bp
    app.register_blueprint(files_bp, url_prefix='/api')
    from api.stats import stats_bp
    app.register_blueprint(stats_bp, url_prefix='/api')
    from api.admin import admin_bp
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    from api.preferences import preferences_bp
    app.register_blueprint(preferences_bp, url_prefix='/api/prefs')
    from api.store import store_bp
    app.register_blueprint(store_bp, url_prefix='/api/store')
    app.register_blueprint(auth_bp)

    return app

app = create_app(os.getenv('FLASK_CONFIG') or 'default')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 15001))
    app.run(host='0.0.0.0', port=port, debug=app.config.get('DEBUG', True))
