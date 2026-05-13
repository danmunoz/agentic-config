#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["google-genai", "Pillow"]
# ///
"""Image creation and editing with Gemini's Nano Banana Pro API."""

import base64
import os
import sys
from io import BytesIO

from google import genai
from PIL import Image

HELP = """nanobanana - Image editing with Gemini's Nano Banana Pro API
Usage:
  nanobanana <image-path> "<prompt>" [output-path]
  nanobanana --create "<prompt>" [output-path]

Options:
  -c, --create  Create a new image from text instead of editing an input image
  -h, --help  Show this usage information and exit

Examples:
  nanobanana photo.jpg "remove the people in the background"
  nanobanana selfie.png "add a sunset background" sunset_selfie.png
  nanobanana food.jpg "make it look more appetizing"
  nanobanana --create "a watercolor postcard of Lisbon at sunrise" lisbon.png

Requires:
  GEMINI_API_KEY environment variable
  or GEMINI_API_KEY in the repo .env file
  uv, installed or checked by agh install
"""


def require_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)
    return api_key


def save_first_image(response, output_path: str) -> str | None:
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            image_data = part.inline_data.data
            if isinstance(image_data, str):
                image_data = base64.b64decode(image_data)

            generated_image = Image.open(BytesIO(image_data))
            generated_image.save(output_path)
            print(f"Saved: {output_path}")
            return output_path
        if getattr(part, "text", None):
            print(f"Response: {part.text}")

    print("Error: no image in response", file=sys.stderr)
    print(f"Full response: {response}", file=sys.stderr)
    return None


def generate_image(prompt: str, output_path: str | None = None) -> str | None:
    """Create an image from a text prompt."""
    api_key = require_api_key()
    client = genai.Client(api_key=api_key)

    if output_path is None:
        output_path = "nanobanana_generated.png"

    print("Creating image with Nano Banana Pro...")
    print(f"   Prompt: {prompt}")

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt],
            config=genai.types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
        )
    except Exception as e:
        print(f"Error calling Gemini API: {e}", file=sys.stderr)
        sys.exit(1)

    return save_first_image(response, output_path)


def edit_image(image_path: str, prompt: str, output_path: str | None = None) -> str | None:
    """Edit an image using Gemini's image generation capabilities."""
    api_key = require_api_key()
    client = genai.Client(api_key=api_key)

    print(f"Loading: {image_path}")
    try:
        image = Image.open(image_path)
    except Exception as e:
        print(f"Error loading image: {e}", file=sys.stderr)
        sys.exit(1)

    if output_path is None:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_edited{ext}"

    print("Sending to Nano Banana Pro...")
    print(f"   Prompt: {prompt}")

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt, image],
            config=genai.types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
        )
    except Exception as e:
        print(f"Error calling Gemini API: {e}", file=sys.stderr)
        sys.exit(1)

    return save_first_image(response, output_path)


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] in {"--help", "-h"}:
        print(HELP)
        sys.exit(0)

    if len(sys.argv) >= 3 and sys.argv[1] in {"--create", "-c"}:
        prompt = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else None
        result = generate_image(prompt, output_path)
        if result is None:
            sys.exit(1)
        return

    if len(sys.argv) < 3:
        print(HELP)
        sys.exit(1)

    image_path = sys.argv[1]
    prompt = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else None

    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    result = edit_image(image_path, prompt, output_path)
    if result is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
