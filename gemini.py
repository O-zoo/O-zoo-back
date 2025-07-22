# To run this code you need to install the following dependencies:
# pip install google-genai

import sys
import io
import base64
import os
from google import genai
from google.genai import types

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def generate(question):
    client = genai.Client(
        api_key="AIzaSyD1u0HO1IgcF6fxdehsgkvSCQZDPYcqFuE",
    )

    model = "gemini-2.0-flash"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=question),
            ],
        ),
    ]
    tools = [
        types.Tool(url_context=types.UrlContext()),
    ]
    generate_content_config = types.GenerateContentConfig(
        tools=tools,
        response_mime_type="text/plain",
        system_instruction=[
            types.Part.from_text(text="""You are a fortune teller for my app users. My app users are gamblers. You will be given one's birthday. By that, you will return one's luck for today, the fortune of one's bet. You have to tell us one's fortune immediatly after the birthday is given. Describe one's fortune in 1 word(one's zodiac) and 2 sentences. Do not repeat one's birthday when answering. Answer should be in Korean."""),
        ],
    )

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        print(chunk.text, end="")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        question = sys.argv[1]
    else:
        question = ""
    generate(question)
