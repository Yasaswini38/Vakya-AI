import assemblyai
print("AssemblyAI version:", assemblyai.__version__)

from assemblyai.streaming.v3 import StreamingClient, StreamingClientOptions
import inspect

print("StreamingClient methods:")
print([m for m in dir(StreamingClient) if not m.startswith("_")])

print("Source of StreamingClient:\n", inspect.getsource(StreamingClient))
