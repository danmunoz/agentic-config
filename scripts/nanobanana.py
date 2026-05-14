#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["google-genai", "Pillow"]
# ///
"""Image creation and editing with Gemini's Nano Banana API."""

import argparse
import base64
import os
import shutil
import sys
from io import BytesIO
from pathlib import Path

from google import genai
from PIL import Image

DEFAULT_MODEL = "gemini-2.5-flash-image"
V2_MODEL = "gemini-3.1-flash-image-preview"
PRO_MODEL = "gemini-3-pro-image-preview"

ASPECT_RATIOS = {
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
}
V2_EXTRA_ASPECT_RATIOS = {"1:4", "4:1", "1:8", "8:1"}
IMAGE_SIZES = {"512", "1K", "2K", "4K"}
REPO_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

EPILOG = """Examples:
  nanobanana edit photo.jpg "remove the people in the background"
  nanobanana edit selfie.png "add a sunset background" --output sunset_selfie.png
  nanobanana create "a watercolor postcard of Lisbon at sunrise" --output lisbon.png
  nanobanana create --v2 --aspect-ratio 9:16 --image-size 1K "poster art"
  nanobanana --dry-run create "poster art"
  nanobanana --doctor

Run "nanobanana create --help" or "nanobanana edit --help" for model, output,
and dry-run options.

Requires:
  GEMINI_API_KEY environment variable
  or GEMINI_API_KEY in the repo .env file
  uv, installed or checked by agh install
"""


def add_common_options(parser: argparse.ArgumentParser) -> None:
    model_group = parser.add_mutually_exclusive_group()
    model_group.add_argument(
        "--pro",
        action="store_true",
        help=f"use {PRO_MODEL}",
    )
    model_group.add_argument(
        "--v2",
        action="store_true",
        help=f"use {V2_MODEL}",
    )
    parser.add_argument(
        "--aspect-ratio",
        choices=sorted(ASPECT_RATIOS | V2_EXTRA_ASPECT_RATIOS),
        help="output aspect ratio",
    )
    parser.add_argument(
        "--image-size",
        choices=sorted(IMAGE_SIZES),
        help="output image size for --pro/--v2",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="output image path",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite an existing output path",
    )
    parser.add_argument(
        "--dry-run",
        "--test",
        action="store_true",
        help="validate inputs and print the planned request without calling Gemini",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nanobanana",
        usage=(
            'nanobanana create [options] "<prompt>" [output-path]\n'
            '                  nanobanana edit [options] <image-path> "<prompt>" [output-path]\n'
            "                  nanobanana --doctor"
        ),
        description="Image creation and editing with Gemini's Nano Banana API.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="check local nanobanana configuration without calling Gemini",
    )
    subparsers = parser.add_subparsers(dest="command")

    create_parser = subparsers.add_parser(
        "create",
        usage='nanobanana create [options] "<prompt>" [output-path]',
        help="create a new image from text",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    add_common_options(create_parser)
    create_parser.add_argument("prompt")
    create_parser.add_argument("output_path", nargs="?")

    edit_parser = subparsers.add_parser(
        "edit",
        usage='nanobanana edit [options] <image-path> "<prompt>" [output-path]',
        help="edit an input image",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    add_common_options(edit_parser)
    edit_parser.add_argument("image_path")
    edit_parser.add_argument("prompt")
    edit_parser.add_argument("output_path", nargs="?")

    subparsers.add_parser(
        "doctor",
        help="check local nanobanana configuration without calling Gemini",
    )

    return parser


def build_legacy_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nanobanana",
        usage=(
            'nanobanana [options] <image-path> "<prompt>" [output-path]\n'
            '                  nanobanana [options] --create "<prompt>" [output-path]'
        ),
        description="Image creation and editing with Gemini's Nano Banana API.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("args", nargs="*", metavar="ARG")
    parser.add_argument(
        "-c",
        "--create",
        action="store_true",
        help="create a new image from text instead of editing an input image",
    )
    parser.add_argument(
        "--doctor",
        action="store_true",
        help="check local nanobanana configuration without calling Gemini",
    )
    add_common_options(parser)
    return parser


def normalize_subcommand_args(argv: list[str]) -> list[str] | None:
    value_options = {"--aspect-ratio", "--image-size", "-o", "--output"}
    command_names = {"create", "edit", "doctor"}
    skip_next = False

    for index, arg in enumerate(argv):
        if skip_next:
            skip_next = False
            continue
        if arg in value_options:
            skip_next = True
            continue
        if any(arg.startswith(f"{option}=") for option in value_options if option.startswith("--")):
            continue
        if arg.startswith("-"):
            continue
        if arg in command_names:
            return [arg, *argv[:index], *argv[index + 1 :]]
        return None

    return None


def parse_args(argv: list[str]) -> argparse.Namespace:
    if not argv:
        parser = build_parser()
        parser.print_help(sys.stderr)
        sys.exit(2)

    if argv[0] in {"-h", "--help"}:
        parser = build_parser()
        return parser.parse_args(argv)

    normalized = normalize_subcommand_args(argv)
    if normalized or argv[0] == "--doctor":
        parser = build_parser()
        parsed = parser.parse_args(normalized or argv)
    else:
        parser = build_legacy_parser()
        parsed = parser.parse_args(argv)
        parsed.command = "create" if parsed.create else "edit"
        expected = 1 if parsed.create else 2
        if len(parsed.args) not in {expected, expected + 1}:
            parser.error(
                "expected "
                + ('"<prompt>" [output-path]' if parsed.create else '<image-path> "<prompt>" [output-path]')
            )
        if parsed.create:
            parsed.prompt = parsed.args[0]
            parsed.output_path = parsed.args[1] if len(parsed.args) > 1 else None
            parsed.image_path = None
        else:
            parsed.image_path = parsed.args[0]
            parsed.prompt = parsed.args[1]
            parsed.output_path = parsed.args[2] if len(parsed.args) > 2 else None

    if getattr(parsed, "doctor", False) or getattr(parsed, "command", None) == "doctor":
        return parsed

    if parsed.image_size and not (parsed.pro or parsed.v2):
        parser.error("--image-size requires --pro or --v2")

    if not parsed.v2 and parsed.aspect_ratio in V2_EXTRA_ASPECT_RATIOS:
        parser.error(f"{selected_model(parsed)} does not support aspect ratio {parsed.aspect_ratio}")

    if parsed.pro and parsed.image_size == "512":
        parser.error("--image-size 512 is only supported with --v2")

    if getattr(parsed, "output", None) and getattr(parsed, "output_path", None):
        parser.error("use either --output or positional output-path, not both")

    return parsed


def selected_model(args: argparse.Namespace) -> str:
    if args.pro:
        return PRO_MODEL
    if args.v2:
        return V2_MODEL
    return DEFAULT_MODEL


def load_repo_env(env_path: Path = REPO_ENV_PATH) -> bool:
    """Load simple KEY=VALUE pairs from the repo .env without overriding env vars."""
    if not env_path.exists():
        return False

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value

    return True


def require_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print(
            "Error: GEMINI_API_KEY is not set. Export it or add it to this repo's .env file.",
            file=sys.stderr,
        )
        sys.exit(1)
    return api_key


def generate_config(aspect_ratio: str | None, image_size: str | None):
    image_config = None
    if aspect_ratio or image_size:
        image_config = genai.types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=image_size,
        )

    return genai.types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=image_config,
    )


def resolve_output_path(
    requested_output: str | None,
    default_output: str,
    *,
    force: bool,
) -> str:
    output_path = Path(requested_output or default_output)
    if not output_path.parent.exists():
        print(f"Error: output directory does not exist: {output_path.parent}", file=sys.stderr)
        sys.exit(1)
    if force or not output_path.exists():
        return str(output_path)

    if requested_output:
        print(
            f"Error: output already exists: {output_path}. Pass --force to overwrite.",
            file=sys.stderr,
        )
        sys.exit(1)

    stem = output_path.stem
    suffix = output_path.suffix
    parent = output_path.parent
    for index in range(1, 1000):
        candidate = parent / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            print(f"Output exists, using: {candidate}")
            return str(candidate)

    print(f"Error: could not find an available output path near {output_path}", file=sys.stderr)
    sys.exit(1)


def response_parts(response) -> list:
    parts = getattr(response, "parts", None)
    if parts:
        return list(parts)

    candidates = getattr(response, "candidates", None) or []
    collected = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        collected.extend(getattr(content, "parts", None) or [])
    return collected


def part_image_data(part) -> bytes | None:
    as_image = getattr(part, "as_image", None)
    if callable(as_image):
        try:
            image = as_image()
        except Exception:
            image = None
        if image is not None:
            image_bytes = getattr(image, "image_bytes", None)
            if image_bytes is not None:
                return image_bytes
            buffer = BytesIO()
            save = getattr(image, "save", None)
            if callable(save):
                image_format = getattr(image, "format", None) or "PNG"
                image.save(buffer, format=image_format)
                return buffer.getvalue()

    inline_data = getattr(part, "inline_data", None)
    if inline_data is None:
        return None

    image_data = getattr(inline_data, "data", None)
    if image_data is None:
        return None
    if isinstance(image_data, str):
        return base64.b64decode(image_data)
    return image_data


def save_first_image(response, output_path: str) -> str | None:
    parts = response_parts(response)
    text_parts = []

    for part in parts:
        image_data = part_image_data(part)
        if image_data is not None:
            save_image_data(image_data, output_path)
            print(f"Saved: {output_path}")
            return output_path
        text = getattr(part, "text", None)
        if text:
            text_parts.append(text)

    print("Error: no image in response", file=sys.stderr)
    if text_parts:
        print(f"Text response: {text_parts[0][:500]}", file=sys.stderr)
    finish_reasons = [
        str(getattr(candidate, "finish_reason", "unknown"))
        for candidate in (getattr(response, "candidates", None) or [])
    ]
    if finish_reasons:
        print(f"Finish reason: {', '.join(finish_reasons)}", file=sys.stderr)
    prompt_feedback = getattr(response, "prompt_feedback", None)
    if prompt_feedback is not None:
        print(f"Prompt feedback: {prompt_feedback}", file=sys.stderr)
    return None


def save_image_data(image_data: bytes, output_path: str) -> None:
    image = Image.open(BytesIO(image_data))
    path = Path(output_path)
    save_options = {}

    if path.suffix.lower() in {".jpg", ".jpeg"} and image.mode in {"RGBA", "LA", "P"}:
        image = image.convert("RGB")
    elif not path.suffix:
        save_options["format"] = "PNG"

    image.save(output_path, **save_options)


def print_plan(
    *,
    mode: str,
    prompt: str,
    model: str,
    output_path: str,
    aspect_ratio: str | None,
    image_size: str | None,
    image_path: str | None = None,
) -> None:
    print("Dry run: Gemini API was not called.")
    print(f"   Mode: {mode}")
    print(f"   Model: {model}")
    if image_path:
        print(f"   Input: {image_path}")
    print(f"   Output: {output_path}")
    if aspect_ratio:
        print(f"   Aspect ratio: {aspect_ratio}")
    if image_size:
        print(f"   Image size: {image_size}")
    print(f"   Prompt: {prompt}")


def request_generated_image(
    *,
    action: str,
    prompt: str,
    model: str,
    config,
    contents: list,
    output_path: str,
) -> str | None:
    api_key = require_api_key()
    client = genai.Client(api_key=api_key)

    print(action)
    print(f"   Model: {model}")
    print(f"   Prompt: {prompt}")

    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
    except Exception as e:
        print(f"Error calling Gemini API: {e}", file=sys.stderr)
        sys.exit(1)

    return save_first_image(response, output_path)


def edit_image(
    image_path: str,
    prompt: str,
    model: str,
    config,
    output_path: str,
) -> str | None:
    """Edit an image using Gemini's image generation capabilities."""
    print(f"Loading: {image_path}")
    try:
        image = Image.open(image_path)
    except Exception as e:
        print(f"Error loading image: {e}", file=sys.stderr)
        sys.exit(1)

    return request_generated_image(
        action="Sending to Nano Banana...",
        prompt=prompt,
        model=model,
        config=config,
        contents=[prompt, image],
        output_path=output_path,
    )


def default_edit_output(image_path: str) -> str:
    base, ext = os.path.splitext(image_path)
    return f"{base}_edited{ext or '.png'}"


def run_doctor() -> int:
    env_loaded = load_repo_env()
    key_configured = bool(os.environ.get("GEMINI_API_KEY"))
    uv_path = shutil.which("uv")

    print("nanobanana doctor")
    print(f"   uv: {uv_path or 'missing'}")
    print(f"   repo .env: {'found' if REPO_ENV_PATH.exists() else 'missing'} ({REPO_ENV_PATH})")
    print(f"   .env loaded: {'yes' if env_loaded else 'no'}")
    print(f"   GEMINI_API_KEY: {'configured' if key_configured else 'missing'}")
    print(f"   google-genai: {getattr(genai, '__version__', 'available')}")
    print(f"   Pillow: {Image.__version__}")
    print(f"   default model: {DEFAULT_MODEL}")
    print("   service call: not performed")

    return 0 if uv_path and key_configured else 1


def main() -> None:
    args = parse_args(sys.argv[1:])
    if args.doctor or args.command == "doctor":
        sys.exit(run_doctor())

    load_repo_env()
    model = selected_model(args)
    config = generate_config(args.aspect_ratio, args.image_size)
    requested_output = args.output or args.output_path

    if args.command == "create":
        output_path = resolve_output_path(
            requested_output,
            "nanobanana_generated.png",
            force=args.force,
        )
        if args.dry_run:
            print_plan(
                mode="create",
                prompt=args.prompt,
                model=model,
                output_path=output_path,
                aspect_ratio=args.aspect_ratio,
                image_size=args.image_size,
            )
            return
        result = request_generated_image(
            action="Creating image with Nano Banana...",
            prompt=args.prompt,
            model=model,
            config=config,
            contents=[args.prompt],
            output_path=output_path,
        )
        if result is None:
            sys.exit(1)
        return

    if not os.path.exists(args.image_path):
        print(f"Error: Image not found: {args.image_path}", file=sys.stderr)
        sys.exit(1)

    output_path = resolve_output_path(
        requested_output,
        default_edit_output(args.image_path),
        force=args.force,
    )
    if args.dry_run:
        print_plan(
            mode="edit",
            prompt=args.prompt,
            model=model,
            output_path=output_path,
            aspect_ratio=args.aspect_ratio,
            image_size=args.image_size,
            image_path=args.image_path,
        )
        return

    result = edit_image(args.image_path, args.prompt, model, config, output_path)
    if result is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
