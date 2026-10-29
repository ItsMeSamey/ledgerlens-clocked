run:
	python app.py

test:
	python -m unittest discover -s tests -v
	node --check static/app.js

evaluate:
	python evaluate.py
