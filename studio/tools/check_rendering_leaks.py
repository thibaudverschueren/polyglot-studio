#!/usr/bin/env python3
"""
check_rendering_leaks.py — Thorough render integrity checker for Polyglot Studio.
Tests both the compiled index.html and every lesson and radar item individually.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
ROOT = os.path.dirname(STUDIO)

sys.path.insert(0, HERE)
import build
import md

def check_html_text(text, context_label):
    issues = []
    
    # 1. Math placeholders not substituted
    if "@@M" in text:
        matches = re.findall(r"@@M\d+@@", text)
        issues.append(f"Unsubstituted math placeholder(s): {matches[:5]}")
        
    # 2. KaTeX error messages
    if "katex-error" in text.lower() or "[katex error" in text.lower():
        issues.append("KaTeX render error detected in HTML")
        
    # 3. Markdown image leak: ![...](...)
    img_leaks = re.findall(r"!\[[^\]]*\]\([^)]+\)", text)
    if img_leaks:
        issues.append(f"Unrendered markdown image: {img_leaks[:3]}")
        
    # 4. Triple backticks leak
    code_leaks = re.findall(r"```[a-zA-Z0-9_-]*\n", text)
    if code_leaks:
        issues.append(f"Unrendered code fence: {code_leaks[:3]}")
        
    # 5. Raw markdown table leak
    table_leaks = re.findall(r"\n\|[-:\s|]+\|\n", text)
    if table_leaks:
        issues.append("Unrendered markdown table separator syntax detected")
        
    # 6. Raw markdown headings leak inside HTML paragraphs
    h_leaks = re.findall(r"<p>[ \t]*#{1,6}\s+[^<]+</p>", text)
    if h_leaks:
        issues.append(f"Unrendered markdown heading in paragraph: {h_leaks[:3]}")
        
    # 7. Unclosed simulator tags
    sim_tags = re.findall(r"<sim:[a-z0-9_-]+", text)
    if sim_tags:
        issues.append(f"Unrendered simulator tag: {sim_tags[:3]}")
        
    # 8. Check image sources exist on disk
    img_srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', text)
    for src in img_srcs:
        if src.startswith("http://") or src.startswith("https://") or src.startswith("data:"):
            continue
        # clean query or hash
        clean_src = src.split("?")[0].split("#")[0]
        full_path = os.path.join(ROOT, clean_src.lstrip("/"))
        if not os.path.isfile(full_path):
            issues.append(f"Missing image asset: {src} -> {full_path}")
            
    return issues

def main():
    all_issues = {}
    total_lessons = 0
    total_radar = 0
    
    # 1. Test every lesson
    lesson_files = sorted(glob.glob(os.path.join(STUDIO, "content", "lessons", "*", "*.json")))
    print(f"Checking {len(lesson_files)} lessons...")
    for lf in lesson_files:
        total_lessons += 1
        rel = os.path.relpath(lf, ROOT)
        with open(lf, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        md.MATH.clear()
        md._MATH_INDEX.clear()
        rendered_obj = build.render_lesson(data)
        rendered_obj, _ = build.render_math(rendered_obj)
        rendered_json_str = json.dumps(rendered_obj, ensure_ascii=False)
        
        issues = check_html_text(rendered_json_str, rel)
        if issues:
            all_issues[rel] = issues

    # 2. Test every radar item
    radar_files = sorted(glob.glob(os.path.join(STUDIO, "content", "radar", "items", "*.json")))
    print(f"Checking {len(radar_files)} radar items...")
    for rf in radar_files:
        total_radar += 1
        rel = os.path.relpath(rf, ROOT)
        with open(rf, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        md.MATH.clear()
        md._MATH_INDEX.clear()
        rendered_obj = build.render_radar(data)
        rendered_obj, _ = build.render_math(rendered_obj)
        rendered_json_str = json.dumps(rendered_obj, ensure_ascii=False)
        
        issues = check_html_text(rendered_json_str, rel)
        if issues:
            all_issues[rel] = issues

    # 3. Test compiled index.html
    index_html_path = os.path.join(ROOT, "index.html")
    if os.path.isfile(index_html_path):
        print("Checking compiled index.html...")
        with open(index_html_path, "r", encoding="utf-8") as f:
            index_content = f.read()
        issues = check_html_text(index_content, "index.html")
        if issues:
            all_issues["index.html"] = issues

    # Summary
    print("\n--- AUDIT SUMMARY ---")
    if not all_issues:
        print(f"SUCCESS: 0 rendering leaks or broken assets across {total_lessons} lessons, {total_radar} radar items, and index.html!")
        return 0
    else:
        print(f"FAILED: Found issues in {len(all_issues)} files:")
        for file, iss in all_issues.items():
            print(f"\n[{file}]:")
            for i in iss:
                print(f"  - {i}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
