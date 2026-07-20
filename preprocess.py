import json

INPUT_FILE = "cleaned_dataset.jsonl"
OUTPUT_FILE = "grouped_dataset.json"

groups = {}

print("Reading cleaned dataset...")

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    for line in f:

        item = json.loads(line)

        context = item["Context"]
        response = item["Response"]

        if context not in groups:
            groups[context] = []

        groups[context].append(response)

print(f"Unique Questions : {len(groups)}")

result = []

for context, responses in groups.items():

    result.append(
        {
            "Context": context,
            "Responses": responses,
            "NumResponses": len(responses)
        }
    )

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("Saved :", OUTPUT_FILE)

print()

print("Top 10 Questions with Most Responses")

result.sort(key=lambda x: x["NumResponses"], reverse=True)

for item in result[:10]:
    print(item["NumResponses"])