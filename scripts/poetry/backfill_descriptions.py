import json
import os
import sqlite3
from pathlib import Path

import pyarrow.parquet as parquet


def main():
    target = Path(os.environ["APPDATA"]) / "baglib/partitions/bayan_poetry.sqlite"
    database = sqlite3.connect(target, timeout=30)
    try:
        database.execute("BEGIN IMMEDIATE")
        columns = {row[1] for row in database.execute("PRAGMA table_info(poems)")}
        if "description_json" not in columns:
            database.execute("ALTER TABLE poems ADD COLUMN description_json TEXT")
        index = 0
        populated = 0
        for filename in sorted(Path(".baglib-data/poetry/shards").glob("*.parquet")):
            for batch in parquet.ParquetFile(filename).iter_batches(batch_size=512):
                for row in batch.to_pylist():
                    index += 1
                    existing = database.execute("SELECT title, source_url, verses_json FROM poems WHERE id=?", (index,)).fetchone()
                    if not existing or existing[0] != (row["poem title"] or "") or existing[1] != row["poem url"] or json.loads(existing[2]) != row["poem verses"]:
                        raise ValueError(f"source-alignment-mismatch:{index}")
                    value = row.get("poem description")
                    encoded = None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                    database.execute("UPDATE poems SET description_json=? WHERE id=?", (encoded, index))
                    populated += value is not None
        if index != database.execute("SELECT COUNT(*) FROM poems").fetchone()[0] or index != 254630:
            raise ValueError("source-count-mismatch")
        database.commit()
        print(json.dumps({"rows_verified": index, "descriptions_retained": populated}))
    except BaseException:
        database.rollback()
        raise
    finally:
        database.close()


if __name__ == "__main__":
    main()
