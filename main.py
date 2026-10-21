"""Entry point for the Horse Racing Simulator."""

import pygame

from game import Game


def main() -> None:
    pygame.init()
    try:
        game = Game()
        game.run()
    finally:
        pygame.quit()


if __name__ == "__main__":
    main()
