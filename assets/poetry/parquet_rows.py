import argparse
import json
import sys

import pyarrow.parquet as parquet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("shards", nargs="+")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    required = {"poem title", "poem verses", "poet name"}
    for filename in args.shards:
        source = parquet.ParquetFile(filename)
        if not required.issubset(source.schema_arrow.names):
            raise ValueError("invalid-poetry-schema")
        for batch in source.iter_batches(batch_size=512):
            for row in batch.to_pylist():
                print(json.dumps(row, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
