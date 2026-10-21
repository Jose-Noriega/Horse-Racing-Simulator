"""Entry point for the Horse Racing Simulator."""

import sys

import pygame

from game import Game


def main() -> None:
    pygame.init()
    try:
        game = Game(secret="--secret" in sys.argv)
        game.run()
    finally:
        pygame.quit()


if __name__ == "__main__":
    main()
