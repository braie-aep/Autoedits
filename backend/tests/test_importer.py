"""Offline smoke tests for the private importer: never download video."""
import os
import sys
import unittest
from pathlib import Path

os.environ["AUTOEDIT_API_KEY"] = "test-development-key-do-not-use-publicly"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from fastapi import HTTPException


class ImporterTests(unittest.TestCase):
    def test_youtube_url_variants(self):
        target = "dQw4w9WgXcQ"
        for address in (
            f"https://www.youtube.com/watch?v={target}",
            f"https://youtube.com/shorts/{target}",
            f"https://www.youtube.com/live/{target}?feature=share",
            f"https://youtu.be/{target}?si=abc",
        ):
            with self.subTest(address=address):
                self.assertEqual(main.parse_video_id(address), target)

    def test_rejects_invalid_sources(self):
        for address in (
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=INVALID",
            "https://youtube.com/@channel",
            "https://example.org/",
        ):
            with self.subTest(address=address):
                with self.assertRaises((HTTPException, ValueError)):
                    main.parse_video_id(address)

    def test_api_authentication(self):
        main.check_key("Bearer test-development-key-do-not-use-publicly")
        with self.assertRaises(HTTPException):
            main.check_key(None)
        with self.assertRaises(HTTPException):
            main.check_key("Bearer incorrect-key")

    def test_routes_exist(self):
        paths = main.app.openapi()["paths"]
        self.assertIn("/health", paths)
        self.assertIn("/api/import", paths)
        self.assertIn("/api/media/{video_id}", paths)


if __name__ == "__main__":
    unittest.main()
