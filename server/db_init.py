# /server/db_init.py
import os
import sys
import glob # For finding zip files
from app import create_app, db
from models import User, UserRole # Import User model and Role enum
from sqlalchemy.exc import IntegrityError # For duplicate game name error
from sqlalchemy.sql import text # To check if user table is empty or other raw SQL
from api.games import import_game_from_zip_path # Import the new function

def initialize_database(app, server_dir):
    """Verwijdert alle bestaande tabellen en maakt nieuwe aan op basis van de modellen."""
    with app.app_context():
        print("INFO: Alle tabellen worden verwijderd...")
        db.drop_all()
        print("INFO: Alle tabellen worden aangemaakt...")
        db.create_all()
        print("INFO: Database schema succesvol aangemaakt.")

        # --- Create Default Users ---
        # Check if users already exist to avoid errors on re-runs if needed
        user_count = db.session.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0
        if user_count == 0:
            print("INFO: Bezig met aanmaken van standaard gebruikers...")
            try:
                # User: ilona
                user_ilona = User(name='ilona', email='ilonabogus2@gmail.com', role=UserRole.USER)
                user_ilona.set_password('ilona1234') # Hash the password
                db.session.add(user_ilona)

                # Admin: allan
                user_allan = User(name='allan', email='wateraxe@gmail.com', role=UserRole.ADMIN)
                user_allan.set_password('roll14me!') # Hash the password
                db.session.add(user_allan)

                db.session.commit()
                print("SUCCES: Standaard gebruikers 'ilona' (user) en 'allan' (admin) aangemaakt.")
            except IntegrityError as e:
                db.session.rollback()
                print(f"FOUT: Kon standaard gebruikers niet aanmaken (mogelijk bestaan ze al): {e}")
            except Exception as e:
                db.session.rollback()
                print(f"FOUT: Onverwachte fout bij aanmaken standaard gebruikers: {e}")
        else:
            print("INFO: Standaard gebruikers bestaan al, overslaan.")

        # --- Interactive Game Import ---
        print("\nINFO: Zoeken naar avonturen om te importeren...")
        games_dir = os.path.join(server_dir, 'games')
        zip_files = glob.glob(os.path.join(games_dir, '*.zip'))

        if not zip_files:
            print("INFO: Geen .zip avonturen gevonden in de 'server/games' map.")
            return # Stop if there are no zip files

        while True:
            # Toon de lijst met gevonden avonturen aan het begin van elke iteratie
            if not zip_files: # Controleer opnieuw voor het geval de lijst leeg is geworden (onwaarschijnlijk hier, maar goede gewoonte)
                print("INFO: Geen .zip avonturen meer beschikbaar.")
                break
            print("\nINFO: Beschikbare avonturen:")
            for i, filepath in enumerate(zip_files):
                print(f"  {i+1}: {os.path.basename(filepath)}")

            try:
                choice = input("\nVoer het nummer in van het avontuur dat je wilt importeren (of 0 om te stoppen): ")
                choice_num = int(choice)

                if choice_num == 0:
                    print("INFO: Importproces gestopt.")
                    break
                elif 1 <= choice_num <= len(zip_files):
                    selected_zip_path = zip_files[choice_num - 1]
                    selected_zip_name = os.path.basename(selected_zip_path)
                    print(f"\nINFO: Bezig met importeren van '{selected_zip_name}'...")
                    try:
                        imported_game = import_game_from_zip_path(selected_zip_path)
                        print(f"SUCCES: Avontuur '{imported_game.name}' succesvol geïmporteerd!")
                        # Optioneel: Verwijder de geïmporteerde zip uit de lijst als je niet wilt dat deze opnieuw wordt getoond
                        # zip_files.pop(choice_num - 1)
                    except FileNotFoundError as e:
                        print(f"FOUT: Kon bestand niet vinden: {e}")
                    except (ValueError, IntegrityError, RuntimeError) as e:
                        print(f"FOUT bij importeren van '{selected_zip_name}': {e}")
                        # Rollback is handled within import_game_from_zip_path
                    except Exception as e:
                        print(f"FOUT: Onverwachte fout bij importeren van '{selected_zip_name}': {e}")
                        db.session.rollback() # Ensure rollback on unexpected errors
                else:
                    print(f"FOUT: Ongeldige keuze '{choice}'. Kies een nummer tussen 0 en {len(zip_files)}.")

            except ValueError:
                print(f"FOUT: Ongeldige invoer '{choice}'. Voer een nummer in.")
            except KeyboardInterrupt:
                 print("\nINFO: Importproces onderbroken door gebruiker.")
                 break


if __name__ == '__main__':
    # Create a Flask app instance using the development configuration
    # This ensures the correct database connection string is used
    config_name = os.getenv('FLASK_CONFIG') or 'development'
    app = create_app(config_name)
    # Define server_dir here
    server_dir = os.path.dirname(os.path.abspath(__file__))

    # Confirm action with the user, especially for potentially destructive operations
    confirm = input("Alle bestaande tabellen verwijderen en schema opnieuw aanmaken. Weet je het zeker? (ja/nee/j/n): ")
    if confirm.lower() in ['yes', 'ja', 'j']: # Accepteer Nederlandse en Engelse bevestiging (en afkortingen)
        # Initialize database and then attempt interactive import
        initialize_database(app, server_dir) # Pass server_dir
    else:
        print("INFO: Database initialisatie geannuleerd.")
