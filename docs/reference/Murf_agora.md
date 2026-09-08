---

title: Agora and Murf
subtitle: Use Murf TTS with Agora’s Conversational AI Engine
------------------------------------------------------------

Murf is available as a text-to-speech (TTS) provider for [Agora’s Conversational AI Engine](https://docs.agora.io/en/ai/get-started/quickstart). You start voice agents through Agora’s REST API and choose Murf for TTS so the agent speaks with Murf voices in your Agora channel sessions.

## Introduction to Agora

Agora’s Conversational AI Engine runs AI voice agents in real time inside Agora channels: end users and agents join the same session, with configurable automatic speech recognition (ASR), large language models (LLMs), and TTS. Agora handles low-latency audio transport; your backend uses Agora’s REST APIs to create agents and pass third-party credentials (including for TTS).

With Murf as your TTS provider, set `vendor` to `murf` in the agent’s `tts` configuration and supply the `params` [documented by Agora for Murf](https://docs.agora.io/en/ai/models/tts/murf). The sections below cover prerequisites, REST examples, and those parameters in more detail.

<Card title="Murf Agora Integration" icon="book" iconSize="small" href="https://docs.agora.io/en/ai/models/tts/murf">
  Build conversational voice agents on Agora with Murf TTS.
</Card>

## Setup & requirements

### Requirements

* [Conversational AI](https://docs.agora.io/en/ai/reference/enable-conversational-ai) enabled for your Agora project
* From [Agora Console](https://console.agora.io/): **App ID**, **Customer ID** and **Customer secret** (for REST auth), and an **RTC token** for the agent to join a channel
* API keys for a supported [LLM](https://docs.agora.io/en/conversational-ai/models/llm/) (e.g. OpenAI) and **Murf** (for TTS)
* A client app that can join a voice or video call on Agora (the user side of the conversation)

### Client SDKs

To build that client, use Agora’s **Voice** or **Video** SDKs for your platform. Install the package for Android, iOS, Web, Windows, macOS, or other targets from [Agora’s SDK documentation](https://docs.agora.io/en/sdks).

### API keys and authentication

* **Murf API key**: from the <a href="https://murf.ai/api/dashboard" target="_blank">Murf API Dashboard</a>
* **Agora REST auth**: use Customer ID and Customer secret as a Basic auth credential; see the [REST quickstart](https://docs.agora.io/en/ai/get-started/quickstart) for how to form base64-encoded credentials for the `join` call

<Card title="REST quickstart" icon="code" iconSize="small" href="https://docs.agora.io/en/ai/get-started/quickstart">
  Start a conversational AI agent over REST
</Card>

## Start a conversational AI agent

Call the `join` endpoint to create an agent that joins an Agora channel. Use Murf in the `tts` block as follows.

**Sample `tts` configuration (Murf)**

```json
"tts": {
  "vendor": "murf",
  "params": {
    "api_key": "<murf_api_key>",
    "base_url": "wss://global.api.murf.ai/v1/speech/stream-input",
    "voiceId": "Gordon",
    "locale": "en-US",
    "rate": 0,
    "pitch": 0,
    "model": "FALCON",
    "sample_rate": 24000
  }
}
```

The examples below follow the [REST quickstart](https://docs.agora.io/en/ai/get-started/quickstart).

<Tabs>
  <Tab title="Node.js">
    ```javascript
    const fetch = require("node-fetch");

    const url = "https://api.agora.io/api/conversational-ai-agent/v2/projects/:appid/join";

    const headers = {
      Authorization: "Basic <your_base64_encoded_credentials>",
      "Content-Type": "application/json",
    };

    const data = {
      name: "unique_name",
      properties: {
        channel: "<your_channel_name>",
        token: "<your_rtc_token>",
        agent_rtc_uid: "0",
        remote_rtc_uids: ["1002"],
        enable_string_uid: false,
        idle_timeout: 120,
        llm: {
          url: "https://api.openai.com/v1/chat/completions",
          api_key: "<your_llm_api_key>",
          system_messages: [
            {
              role: "system",
              content: "You are a helpful chatbot.",
            },
          ],
          greeting_message: "Hello, how can I help you?",
          failure_message: "Sorry, I don't know how to answer this question.",
          max_history: 10,
          params: {
            model: "gpt-4o-mini",
          },
        },
        asr: {
          language: "en-US",
        },
        tts: {
          vendor: "murf",
          params: {
            api_key: "<murf_api_key>",
            base_url: "wss://global.api.murf.ai/v1/speech/stream-input",
            voiceId: "Gordon",
            locale: "en-US",
            rate: 0,
            pitch: 0,
            model: "FALCON",
            sample_rate: 24000,
          },
        },
      },
    };

    fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(data),
    })
      .then((response) => response.json())
      .then((json) => console.log(json))
      .catch((error) => console.error("Error:", error));
    ```
  </Tab>

  <Tab title="cURL">
    ```bash
    curl --request POST \
      --url https://api.agora.io/api/conversational-ai-agent/v2/projects/:appid/join \
      --header 'Authorization: Basic <your_base64_encoded_credentials>' \
      --header 'Content-Type: application/json' \
      --data '
    {
      "name": "unique_name",
      "properties": {
        "channel": "<your_channel_name>",
        "token": "<your_rtc_token>",
        "agent_rtc_uid": "0",
        "remote_rtc_uids": ["1002"],
        "enable_string_uid": false,
        "idle_timeout": 120,
        "llm": {
          "url": "https://api.openai.com/v1/chat/completions",
          "api_key": "<your_llm_api_key>",
          "system_messages": [
            {
              "role": "system",
              "content": "You are a helpful chatbot."
            }
          ],
          "greeting_message": "Hello, how can I help you?",
          "failure_message": "Sorry, I don\u0027t know how to answer this question.",
          "max_history": 10,
          "params": {
            "model": "gpt-4o-mini"
          }
        },
        "asr": {
          "language": "en-US"
        },
        "tts": {
          "vendor": "murf",
          "params": {
            "api_key": "<murf_api_key>",
            "base_url": "wss://global.api.murf.ai/v1/speech/stream-input",
            "voiceId": "Gordon",
            "locale": "en-US",
            "rate": 0,
            "pitch": 0,
            "model": "FALCON",
            "sample_rate": 24000
          }
        }
      }
    }'
    ```
  </Tab>

  <Tab title="Python">
    ```python
    import json
    import requests

    url = "https://api.agora.io/api/conversational-ai-agent/v2/projects/:appid/join"

    headers = {
        "Authorization": "Basic <your_base64_encoded_credentials>",
        "Content-Type": "application/json",
    }

    data = {
        "name": "unique_name",
        "properties": {
            "channel": "<your_channel_name>",
            "token": "<your_rtc_token>",
            "agent_rtc_uid": "0",
            "remote_rtc_uids": ["1002"],
            "enable_string_uid": False,
            "idle_timeout": 120,
            "llm": {
                "url": "https://api.openai.com/v1/chat/completions",
                "api_key": "<your_llm_api_key>",
                "system_messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful chatbot."
                    }
                ],
                "greeting_message": "Hello, how can I help you?",
                "failure_message": "Sorry, I don't know how to answer this question.",
                "max_history": 10,
                "params": {
                    "model": "gpt-4o-mini"
                }
            },
            "asr": {
                "language": "en-US"
            },
            "tts": {
                "vendor": "murf",
                "params": {
                    "api_key": "<murf_api_key>",
                    "base_url": "wss://global.api.murf.ai/v1/speech/stream-input",
                    "voiceId": "Gordon",
                    "locale": "en-US",
                    "rate": 0,
                    "pitch": 0,
                    "model": "FALCON",
                    "sample_rate": 24000
                }
            }
        }
    }

    response = requests.post(url, headers=headers, data=json.dumps(data))
    print(response.text)
    ```
  </Tab>
</Tabs>

A successful response (`200 OK`) includes `agent_id`, `create_ts`, and `status`.

## TTS `params` reference (Murf)

These fields are described in the [Agora Murf documentation](https://docs.agora.io/en/ai/models/tts/murf) as validated for the Conversational AI Engine.

| Parameter     | Type              | Description                                                                                    |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `api_key`     | string (required) | Murf API key for authentication.                                                               |
| `base_url`    | string (nullable) | WebSocket endpoint for streaming TTS (e.g. `wss://global.api.murf.ai/v1/speech/stream-input`). |
| `voiceId`     | string (nullable) | Voice id (e.g. `Gordon`).                                                                      |
| `locale`      | string (nullable) | Locale for the voice (e.g. `en-US`).                                                           |
| `rate`        | number (nullable) | Speech rate; `0` is default.                                                                   |
| `pitch`       | number (nullable) | Pitch; `0` is default.                                                                         |
| `model`       | string (nullable) | TTS model (e.g. `FALCON`).                                                                     |
| `sample_rate` | number (nullable) | Audio sample rate in Hz (e.g. `24000`).                                                        |

## Features

* **Enterprise-grade TTS**: Murf models for natural agent speech in Agora channels
* **Streaming**: Murf WebSocket output aligned with Agora’s real-time stack when configured with the documented `base_url`
* **Voice and audio controls**: `voiceId`, `locale`, `rate`, `pitch`, `model`, and `sample_rate` in `params`

## Available voices

<Card icon="fa-light fa-waveform-lines" title="Find your Perfect Voice" href="https://murf.ai/api/products/text-to-speech/Falcon?utm_source=murf_api_docs">
  Explore, preview, and select from 150+ voices in 20+ expressive styles
</Card>

## Support

* **Agora**: [Conversational AI documentation](https://docs.agora.io/en/ai/get-started/quickstart) and [Murf TTS](https://docs.agora.io/en/ai/models/tts/murf)
* **Murf API**: <a href="https://murf.ai/api/dashboard" target="_blank">Murf API Dashboard</a> and [Murf API documentation](https://murf.ai/api/docs)
* **Email**: [support@murf.ai](mailto:support@murf.ai)
