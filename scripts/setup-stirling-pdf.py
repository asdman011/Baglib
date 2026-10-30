#!/usr/bin/env python3
"""
Stirling-PDF v3.2.2 & Java 25 JRE Provisioning Script for Baglib
Downloads:
1. Adoptium Eclipse Temurin JRE 25 (x64 Windows) -> .baglib-data/pdf-engine/java/jdk-25-jre/
2. Stirling-PDF-server.jar v3.2.2 -> .baglib-data/pdf-engine/stirling/Stirling-PDF-server.jar
"""

import os
import hashlib
import re
import sys
import time
import zipfile
import urllib.request
from pathlib import Path

JAVA25_URL = "https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.5%2B8/OpenJDK25U-jre_x64_windows_hotspot_25.0.5_8.zip"
STIRLING_JAR_URL = "https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v3.2.2/Stirling-PDF-server.jar"

ROOT_DIR = Path(__file__).resolve().parent.parent / ".baglib-data" / "pdf-engine"
JAVA_TARGET_DIR = ROOT_DIR / "java"
STIRLING_TARGET_DIR = ROOT_DIR / "stirling"

def sha256_file(filename: Path):
    digest = hashlib.sha256()
    with filename.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def download_file(url: str, dest: Path, desc: str, expected_sha256=None):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".download")
    req = urllib.request.Request(url, headers={"User-Agent": "Baglib-Stirling-Installer/1.0"})
    
    print(f"[*] Starting download of {desc}...")
    start_time = time.time()
    with urllib.request.urlopen(req, timeout=30) as resp:
        total_size = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1 MB
        
        with open(tmp, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                pct = round((downloaded / total_size) * 100, 1) if total_size else 0
                speed = (downloaded / (1024 * 1024)) / max(0.001, time.time() - start_time)
                print(f"\r    -> {desc}: {downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB ({pct}%) at {speed:.2f} MB/s", end="", flush=True)
    
    print()
    if tmp.is_file():
        if expected_sha256 and sha256_file(tmp) != expected_sha256:
            tmp.unlink()
            raise RuntimeError(f"SHA256 verification failed for {desc}")
        if dest.is_file():
            dest.unlink()
        tmp.rename(dest)
    print(f"[✓] Completed {desc} -> {dest}")

def setup_java():
    JAVA_TARGET_DIR.mkdir(parents=True, exist_ok=True)
    
    # Check if a Java 25 executable is already present
    for p in JAVA_TARGET_DIR.glob("**/java.exe"):
        if "25" in str(p.parent.parent.name):
            print(f"[✓] Java 25 already installed at: {p}")
            return p

    zip_path = JAVA_TARGET_DIR / "jre25.zip"
    download_file(JAVA25_URL, zip_path, "Adoptium Temurin JRE 25 (56 MB)")
    
    print("[*] Extracting Java 25 JRE...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(JAVA_TARGET_DIR)
    
    if zip_path.is_file():
        zip_path.unlink()
    
    # Verify extraction
    java_exe = None
    for p in JAVA_TARGET_DIR.glob("**/java.exe"):
        if "25" in str(p.parent.parent.name):
            java_exe = p
            break
            
    if java_exe and java_exe.is_file():
        print(f"[✓] Successfully provisioned Java 25 JRE at {java_exe}")
        return java_exe
    else:
        print("[!] Java 25 java.exe not found after extraction")
        return None

def setup_stirling():
    STIRLING_TARGET_DIR.mkdir(parents=True, exist_ok=True)
    jar_path = STIRLING_TARGET_DIR / "Stirling-PDF-server.jar"
    
    if jar_path.is_file() and jar_path.stat().st_size > 150 * 1024 * 1024:
        print(f"[✓] Stirling-PDF v3.2.2 JAR already present at: {jar_path} ({round(jar_path.stat().st_size / (1024*1024), 2)} MB)")
        return jar_path

    download_file(STIRLING_JAR_URL, jar_path, "Stirling-PDF v3.2.2 Server JAR (180 MB)")
    return jar_path

def setup_native_module(jar_path: Path):
    if os.name != 'nt':
        return None
    with zipfile.ZipFile(jar_path) as archive:
        versions = [match.group(1) for name in archive.namelist()
                    if (match := re.fullmatch(r'BOOT-INF/lib/jpdfium-(\d[^/]*)\.jar', name))]
    if len(versions) != 1:
        raise RuntimeError('Cannot identify the bundled JPDFium version')
    version = versions[0]
    directory = jar_path.parent / 'natives'
    target = directory / f'jpdfium-natives-windows-x64-{version}.jar'
    checksum = target.with_suffix('.jar.sha256')
    if target.is_file() and checksum.is_file() and sha256_file(target) == checksum.read_text().strip():
        print(f"[✓] Verified Windows PDF native module: {target}")
        return target
    url = f'https://repo.maven.apache.org/maven2/com/stirling/jpdfium-natives-windows-x64/{version}/{target.name}'
    with urllib.request.urlopen(url + '.sha256', timeout=30) as response:
        expected = response.read().decode('ascii').strip().lower()
    if not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise RuntimeError('Invalid native module checksum')
    if not target.is_file() or sha256_file(target) != expected:
        download_file(url, target, f'Windows PDF native module {version}', expected)
    checksum.write_text(expected, encoding='ascii')
    return target

def main():
    print("=== Provisioning Stirling-PDF v3.2.2 & Java 25 Environment for Baglib ===")
    java_exe = setup_java()
    stirling_jar = setup_stirling()
    setup_native_module(stirling_jar)
    
    print("\n=== Validation ===")
    if java_exe:
        print(f"Java 25 Path: {java_exe}")
    if stirling_jar:
        print(f"Stirling-PDF JAR Path: {stirling_jar}")
        
    print("\n[✓] Stirling-PDF & Java 25 Environment Ready.")

if __name__ == "__main__":
    main()
