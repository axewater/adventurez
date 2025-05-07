import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Define the base directory of the application
basedir = os.path.abspath(os.path.dirname(__file__))
# Define the instance folder path relative to the base directory
instance_path = os.path.join(os.path.dirname(basedir), 'instance')


class Config:
    """Base configuration class."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'you-should-really-change-this')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Ensure the instance folder exists (used by Flask instance_relative_config)
    APP_VERSION = "1.1.2" # Define the application version
    INSTANCE_FOLDER_PATH = instance_path
    # Define the absolute path to the uploads folder
    UPLOADS_FOLDER = os.path.abspath(os.path.join(basedir, '..', 'client', 'uploads'))

    @staticmethod
    def init_app(app):
        # Create instance folder if it doesn't exist
        try:
            if not os.path.exists(app.instance_path):
                 os.makedirs(app.instance_path)
                 print(f"Created instance folder at: {app.instance_path}")
        except OSError as e:
            print(f"Error creating instance folder: {e}")


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    # Default to PostgreSQL if DATABASE_URL is not set, using the provided connection string
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL',
                                             'postgresql://postgres:!Piratingin2024!@theknox:5432/adventurez')


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    # Use a separate PostgreSQL database for testing, configured via environment variable
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL',
                                             'postgresql://postgres:!Piratingin2024!@theknox:5432/adventurez_test') # Example fallback
    WTF_CSRF_ENABLED = False # Disable CSRF forms protection in testing


class ProductionConfig(Config):
    """Production configuration."""
    # Production database URL should be set via environment variable
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    # Add any other production-specific settings here


# Dictionary to access config classes by name
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
