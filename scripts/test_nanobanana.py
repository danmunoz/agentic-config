import base64
import contextlib
import importlib.util
import io
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image


SCRIPT_PATH = Path(__file__).with_name("nanobanana.py")
SPEC = importlib.util.spec_from_file_location("nanobanana", SCRIPT_PATH)
nanobanana = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(nanobanana)


def quiet_parse_args(argv):
    with contextlib.redirect_stderr(io.StringIO()):
        return nanobanana.parse_args(argv)


class NanobananaArgTests(unittest.TestCase):
    def test_parse_args_accepts_options_before_subcommand(self):
        args = quiet_parse_args(["--dry-run", "create", "poster art"])

        self.assertEqual(args.command, "create")
        self.assertTrue(args.dry_run)
        self.assertEqual(args.prompt, "poster art")

    def test_parse_args_accepts_legacy_create_form(self):
        args = quiet_parse_args(["--create", "poster art", "poster.png"])

        self.assertEqual(args.command, "create")
        self.assertEqual(args.prompt, "poster art")
        self.assertEqual(args.output_path, "poster.png")

    def test_parse_args_rejects_image_size_without_newer_model(self):
        with self.assertRaises(SystemExit) as raised:
            quiet_parse_args(["create", "--image-size", "1K", "poster art"])

        self.assertEqual(raised.exception.code, 2)

    def test_parse_args_rejects_flash_only_options_for_pro(self):
        with self.assertRaises(SystemExit) as raised:
            quiet_parse_args(["create", "--pro", "--aspect-ratio", "1:8", "poster art"])

        self.assertEqual(raised.exception.code, 2)

        with self.assertRaises(SystemExit) as raised:
            quiet_parse_args(["create", "--pro", "--image-size", "512", "poster art"])

        self.assertEqual(raised.exception.code, 2)


class NanobananaPathTests(unittest.TestCase):
    def test_default_edit_output_keeps_extension_or_uses_png(self):
        self.assertEqual(nanobanana.default_edit_output("photo.jpg"), "photo_edited.jpg")
        self.assertEqual(nanobanana.default_edit_output("input"), "input_edited.png")

    def test_resolve_output_path_autoincrements_only_default_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = Path(tmp) / "nanobanana_generated.png"
            existing.touch()

            with contextlib.redirect_stdout(io.StringIO()):
                output_path = nanobanana.resolve_output_path(None, str(existing), force=False)

            self.assertEqual(output_path, str(Path(tmp) / "nanobanana_generated_1.png"))

    def test_resolve_output_path_rejects_existing_requested_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            existing = Path(tmp) / "requested.png"
            existing.touch()

            with self.assertRaises(SystemExit) as raised:
                with contextlib.redirect_stderr(io.StringIO()):
                    nanobanana.resolve_output_path(str(existing), "default.png", force=False)

            self.assertEqual(raised.exception.code, 1)


class NanobananaEnvTests(unittest.TestCase):
    def test_load_repo_env_reads_simple_values_without_overriding(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / ".env"
            env_path.write_text(
                "GEMINI_API_KEY='file-key'\nEXISTING=file-value\n# ignored\n",
                encoding="utf-8",
            )

            with mock.patch.dict(os.environ, {"EXISTING": "shell-value"}, clear=True):
                loaded = nanobanana.load_repo_env(env_path)

                self.assertTrue(loaded)
                self.assertEqual(os.environ["GEMINI_API_KEY"], "file-key")
                self.assertEqual(os.environ["EXISTING"], "shell-value")


class NanobananaResponseTests(unittest.TestCase):
    def test_response_parts_supports_candidate_content_shape(self):
        part = SimpleNamespace(text="hello")
        response = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])

        self.assertEqual(nanobanana.response_parts(response), [part])

    def test_save_first_image_saves_base64_inline_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            image_data = image_bytes("RGBA")
            encoded = base64.b64encode(image_data).decode("ascii")
            part = SimpleNamespace(inline_data=SimpleNamespace(data=encoded), text=None)
            response = SimpleNamespace(parts=[part])
            output_path = Path(tmp) / "generated.png"

            with contextlib.redirect_stdout(io.StringIO()):
                result = nanobanana.save_first_image(response, str(output_path))

            self.assertEqual(result, str(output_path))
            with Image.open(output_path) as image:
                self.assertEqual(image.format, "PNG")

    def test_save_image_data_handles_jpeg_and_extensionless_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            jpg_path = Path(tmp) / "generated.jpg"
            no_ext_path = Path(tmp) / "generated"

            data = image_bytes("RGBA")
            nanobanana.save_image_data(data, str(jpg_path))
            nanobanana.save_image_data(data, str(no_ext_path))

            with Image.open(jpg_path) as image:
                self.assertEqual(image.mode, "RGB")
            with Image.open(no_ext_path) as image:
                self.assertEqual(image.format, "PNG")


def image_bytes(mode):
    buffer = io.BytesIO()
    color = (255, 0, 0, 128) if mode == "RGBA" else "red"
    Image.new(mode, (2, 2), color).save(buffer, format="PNG")
    return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
