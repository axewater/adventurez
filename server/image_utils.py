import os
from pathlib import Path
from PIL import Image, ExifTags
from flask import current_app

# Define image subdirectories relative to the main uploads folder
IMAGE_SUBDIRS = {
    'game_loss': 'avonturen',
    'game_start': 'avonturen',
    'game_win': 'avonturen',
    'room': 'images/kamers',
    'entity': 'images/entiteiten',
}

# Helper to get orientation from EXIF data
for orientation_key in ExifTags.TAGS.keys():
    if ExifTags.TAGS[orientation_key] == 'Orientation':
        ORIENTATION_TAG = orientation_key
        break

def get_absolute_image_path(relative_path: str, image_type: str) -> Path | None:
    """
    Constructs the absolute path for an image file given its relative path and type.

    Args:
        relative_path: The filename stored in the database (e.g., 'my_image.png').
        image_type: The type of image ('game_start', 'game_win', 'game_loss', 'room', 'entity').

    Returns:
        A Path object representing the absolute path, or None if inputs are invalid.
    """
    if not relative_path or not image_type:
        return None

    # Get base uploads folder from app config
    uploads_folder_path = current_app.config.get('UPLOADS_FOLDER')
    if not uploads_folder_path:
        current_app.logger.error("UPLOADS_FOLDER is not configured in the Flask app.")
        return None
    base_uploads_dir = Path(uploads_folder_path)
    subdir = IMAGE_SUBDIRS.get(image_type)
    if not subdir:
        current_app.logger.error(f"Invalid image type '{image_type}' provided for path resolution.")
        return None

    # Use Path objects for robust joining, handles different OS separators
    # Handles potential UNC paths if base_uploads_dir is UNC
    # Handles spaces in filenames automatically
    try:
        # Ensure relative_path doesn't try to escape the subdir (basic security)
        if '..' in Path(relative_path).parts:
             current_app.logger.warning(f"Potential path traversal attempt blocked for: {relative_path}")
             return None
        full_path = base_uploads_dir / subdir / relative_path
        return full_path
    except Exception as e:
        current_app.logger.error(f"Error constructing path for '{relative_path}' in '{subdir}': {e}")
        return None

def _apply_exif_orientation(image: Image.Image) -> Image.Image:
    """Applies EXIF orientation tag to the image."""
    try:
        exif = image._getexif()
        if exif is None:
            return image

        orientation = exif.get(ORIENTATION_TAG)

        if orientation == 3:
            image = image.rotate(180, expand=True)
        elif orientation == 6:
            image = image.rotate(270, expand=True)
        elif orientation == 8:
            image = image.rotate(90, expand=True)
        # Other orientations (like flips) are less common and ignored for simplicity
        # Reset orientation tag after applying
        # exif[ORIENTATION_TAG] = 1 # Doesn't work directly on PIL exif data
    except (AttributeError, KeyError, IndexError, TypeError):
        # cases: image doesn't have getexif, exif tag not present, etc.
        pass # Ignore errors related to EXIF processing
    return image

def compress_and_convert_image(source_path: Path, quality: int = 80, max_size: tuple[int, int] = (800, 800)) -> tuple[Path | None, bool]:
    """
    Compresses an image and converts it to JPG format.
    Optionally resizes the image to fit within max_size dimensions while maintaining aspect ratio.

    Args:
        source_path: The absolute Path object of the source image.
        quality: The desired JPG quality (0-100, default 80).
        max_size: A tuple (max_width, max_height) for resizing (default 800x800). Set to None to disable resizing.

    Returns:
        A tuple: (new_path, extension_changed).
        - new_path: The absolute Path object of the newly created JPG image, or None if conversion failed.
        - extension_changed: True if the original file extension was not '.jpg', False otherwise.
    """
    if not source_path or not source_path.is_file():
        current_app.logger.warning(f"Compress: Source image not found or not a file: {source_path}")
        return None, False

    original_extension = source_path.suffix.lower()
    target_filename = source_path.stem + ".jpg"
    target_path = source_path.with_name(target_filename)

    extension_changed = (original_extension != ".jpg")

    try:
        with Image.open(source_path) as img:
            # Apply EXIF orientation before resizing/saving
            img = _apply_exif_orientation(img)

            # --- NEW: Resizing Logic ---
            if max_size:
                original_width, original_height = img.size
                if original_width > max_size[0] or original_height > max_size[1]:
                    img.thumbnail(max_size, Image.Resampling.LANCZOS) # Resize in place, maintains aspect ratio
                    current_app.logger.info(f"Resize: Resized '{source_path.name}' to fit within {max_size[0]}x{max_size[1]}. New size: {img.size}")
            # --- End Resizing Logic ---
            # Ensure image is in RGB mode for JPG saving (handles PNGs with alpha)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create a white background image if alpha channel exists
                background = Image.new('RGB', img.size, (255, 255, 255))
                # Paste the image onto the background using the alpha channel as mask
                try:
                    # This works for RGBA and LA
                    background.paste(img, (0, 0), img.split()[-1])
                    img_to_save = background
                except IndexError:
                    # Handle Palette mode (P) by converting directly to RGB
                    img_to_save = img.convert('RGB')

            elif img.mode != 'RGB':
                 # Convert other modes like L (grayscale) to RGB
                 img_to_save = img.convert('RGB')
            else:
                 img_to_save = img # Already RGB

            # Save as JPG with specified quality
            img_to_save.save(target_path, format='JPEG', quality=quality, optimize=True)
            current_app.logger.info(f"Compress: Successfully converted '{source_path.name}' to '{target_path.name}' with quality {quality}.")
            return target_path, extension_changed

    except FileNotFoundError:
        current_app.logger.warning(f"Compress: File disappeared before processing: {source_path}")
        return None, False
    except Exception as e:
        current_app.logger.error(f"Compress: Failed to convert image '{source_path.name}': {e}", exc_info=True)
        # Clean up potentially partially created target file
        if target_path.exists():
            try:
                target_path.unlink()
            except OSError as unlink_err:
                 current_app.logger.error(f"Compress: Failed to remove partially created file '{target_path}': {unlink_err}")
        return None, False

def delete_file(file_path: Path) -> bool:
    """Safely deletes a file."""
    if not file_path or not file_path.is_file():
        current_app.logger.warning(f"Delete: File not found or not a file: {file_path}")
        return False
    try:
        file_path.unlink()
        current_app.logger.info(f"Delete: Successfully deleted file: {file_path}")
        return True
    except OSError as e:
        current_app.logger.error(f"Delete: Failed to delete file '{file_path}': {e}")
        return False
