import os
import re

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Perform replacements
        # Vayu.ai / Vayu.Ai -> Vio.ai
        content = re.sub(r'\bVayu\.ai\b', 'Vio.ai', content, flags=re.IGNORECASE)
        # VAYU -> VIO
        content = re.sub(r'\bVAYU\b', 'VIO', content)
        # Vayu -> Vio
        content = re.sub(r'\bVayu\b', 'Vio', content)
        # vayu -> vio
        content = re.sub(r'\bvayu\b', 'vio', content)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"Failed to process {filepath}: {e}")

def walk_dir(root_dir):
    for root, dirs, files in os.walk(root_dir):
        # exclude certain directories
        dirs[:] = [d for d in dirs if d not in ['.next', 'node_modules', '.git']]
        for file in files:
            # only process text/code files
            if file.endswith(('.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html')):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    walk_dir(r"c:\Users\akgam\Documents\ET GEN AI hack\airsight-data\web")
    print("Done replacing names!")
