# /server/api/stats.py
from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from sqlalchemy import func, desc

from app import db
from models import HighScore, User, Game

# Create a Blueprint for stats routes
stats_bp = Blueprint('stats_bp', __name__)

@stats_bp.route('/highscores', methods=['GET'])
@login_required # Ensure user is logged in to view scores
def get_high_scores():
    """
    Retrieves high scores for ALL users across ALL games.
    Returns data structured for a table:
    {
        "games": ["Game 1 Name", "Game 2 Name", ...],
        "scores": [
            {
                "user_name": "User A",
                "scores": {"Game 1 Name": 100, "Game 2 Name": 50, ...},
                "total_score": 150
            },
            {
                "user_name": "User B",
                "scores": {"Game 1 Name": 75, "Game 2 Name": 120, ...},
                "total_score": 195
            },
            ...
        ]
    }
    """
    try:
        # 1. Get ALL game names
        all_games = Game.query.order_by(Game.name).all()
        game_names = [g.name for g in all_games]
        game_ids = {g.name: g.id for g in all_games} # Map name to ID for score lookup

        # 2. Get ALL users
        all_users = User.query.order_by(User.name).all()

        # 3. Fetch all existing high scores with user and game IDs
        all_scores_db = db.session.query(
            HighScore.user_id,
            HighScore.game_id,
            HighScore.score
        ).all()

        # Create a lookup dictionary for faster access: {(user_id, game_id): score}
        score_lookup = {(score.user_id, score.game_id): score.score for score in all_scores_db}

        # 4. Structure the data
        scores_by_user = {}
        for user in all_users:
            scores_by_user[user.name] = {
                "user_name": user.name,
                "scores": {game_name: 0 for game_name in game_names}, # Initialize all games with 0
                "total_score": 0
            }

            # Populate scores from the lookup
            for game_name, game_id in game_ids.items():
                score = score_lookup.get((user.id, game_id))
                if score is not None:
                    scores_by_user[user.name]["scores"][game_name] = score

        # Calculate totals and format the final list
        final_scores_list = []
        for user_name, data in scores_by_user.items():
            data["total_score"] = sum(data["scores"].values())
            final_scores_list.append(data)

        # Sort by total score descending
        final_scores_list.sort(key=lambda x: x["total_score"], reverse=True)

        return jsonify({
            "games": game_names,
            "scores": final_scores_list
        }), 200

    except Exception as e:
        print(f"Error fetching high scores: {e}")
        return jsonify({"error": "Failed to retrieve high scores"}), 500
