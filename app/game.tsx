import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { onValue, ref, set, update, get } from 'firebase/database';
import { database } from '../firebase';

// --- Helper Functions ---
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

const Card = ({ card, onPress, isSelected, isPeeked }) => {
    const cardContent = isPeeked ? `${card.value}${card.suit}` : (card ? '' : '');
    const cardStyle = [styles.card, isSelected && styles.selectedCard];
    const cardBackStyle = [styles.cardBack, isSelected && styles.selectedCard];

    if (!card) {
        return <View style={cardStyle} />;
    }

    return (
      <TouchableOpacity onPress={onPress} style={cardStyle}>
        {isPeeked ? (
            <Text style={styles.cardText}>{cardContent}</Text>
        ) : (
            <View style={cardBackStyle}>
                <Text style={styles.cardText}></Text>
            </View>
        )}
      </TouchableOpacity>
    );
};

const Game = () => {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { room, player } = params;
    const otherPlayer = player === 'player1' ? 'player2' : 'player1';

    const [gameState, setGameState] = useState(null);
    const [drawnCard, setDrawnCard] = useState(null);
    const [specialPower, setSpecialPower] = useState(null); // { type, message }
    const [selectedCards, setSelectedCards] = useState([]); // { cardIndex, owner }
    const [peekedCard, setPeekedCard] = useState(null); // { card, index, owner }
    const touchTimer = useRef(null);

    // --- Game State Syncing ---
    useEffect(() => {
        if (!room) return;
        const roomRef = ref(database, `rooms/${room}`);
        const unsubscribe = onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setGameState(data);
                if (data.roundOver) handleRoundOver(data);
            } else {
                setGameState(null);
                Alert.alert("Room closed", "The host left the game.", [
                    { text: "OK", onPress: () => router.push('/') },
                ]);
            }
        });

        return () => unsubscribe();
    }, [room, router]);

    useEffect(() => {
        if (gameState?.stuckPlayer && gameState.turn === gameState.stuckPlayer) {
            endRound();
        }
    }, [gameState?.turn, gameState?.stuckPlayer]);

    useEffect(() => {
        if (gameState?.turn) {
            setSpecialPower(null);
            setSelectedCards([]);
            setPeekedCard(null);
        }
    }, [gameState?.turn]);

    // --- Core Game Logic ---
    const calculateHandValue = (hand) => {
        return hand.reduce((sum, card) => {
            if (['J', 'Q', 'K'].includes(card.value)) return sum + 10;
            if (card.value === 'A') return sum + 1;
            return sum + parseInt(card.value, 10);
        }, 0);
    };

    const handleRoundOver = (data) => {
        const player1Score = calculateHandValue(data.players.player1.hand);
        const player2Score = calculateHandValue(data.players.player2.hand);
        let winnerMessage = `Player 1: ${player1Score}, Player 2: ${player2Score}`;
        if (player1Score < player2Score) winnerMessage += '\nPlayer 1 wins!';
        else if (player2Score < player1Score) winnerMessage += '\nPlayer 2 wins!';
        else winnerMessage += "\nIt's a tie!";

        Alert.alert('Round Over', winnerMessage, [{ text: 'OK', onPress: () => router.push('/') }]);
    };

    const endRound = () => {
        update(ref(database, `rooms/${room}`), { roundOver: true });
    };

    const startGame = () => {
        const suits = ['♠', '♥', '♣', '♦'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        let deck = [];
        for (let suit of suits) {
            for (let value of values) {
                deck.push({ suit, value });
            }
        }
        deck = shuffle(deck);
        const player1Hand = deck.splice(0, 4);
        const player2Hand = deck.splice(0, 4);
        const discardPile = deck.splice(0, 1);

        set(ref(database, `rooms/${room}`), {
            players: { player1: { hand: player1Hand }, player2: { hand: player2Hand } },
            deck,
            discardPile,
            isGameStarted: true,
            turn: 'player1',
            roundOver: false,
        });
    };

    const drawFromDeck = () => {
        if (gameState.turn !== player || drawnCard || specialPower) return;
        const newDeck = [...gameState.deck];
        const card = newDeck.pop();
        update(ref(database, `rooms/${room}`), { deck: newDeck });
        setDrawnCard(card);
    };

    const discardDrawnCard = () => {
        if (!drawnCard) return;
        const discardedCard = drawnCard;
        const newDiscardPile = [...gameState.discardPile, discardedCard];
        setDrawnCard(null);

        update(ref(database, `rooms/${room}`), { 
            discardPile: newDiscardPile,
            turn: nextTurn()
        });

        // Activate special powers
        if (['9', '10'].includes(discardedCard.value)) {
            setSpecialPower({ type: 'peek', message: 'PEEK: Tap an opponent\'s card to see it.' });
        } else if (discardedCard.value === 'J') {
            setSpecialPower({ type: 'blindSwap', message: 'JACK DISCARDED: Choose two cards to switch!' });
        } else if (discardedCard.value === 'K' && ['♠', '♣'].includes(discardedCard.suit)) {
            setSpecialPower({ type: 'king_peek', message: 'BLACK KING: Tap ANY card to peek.' });
        }
    };
    
    const nextTurn = () => (gameState.turn === 'player1' ? 'player2' : 'player1');

    const handleStick = () => {
        if (!!gameState.stuckPlayer) return;
        update(ref(database, `rooms/${room}`), { stuckPlayer: player });
    };

    // --- Penalty Logic ---
    const handlePenalty = async () => {
        Alert.alert("Penalty!", "Two-hand touch detected. A penalty card is being added to your hand.");
        const roomRef = ref(database, `rooms/${room}`);
        const snapshot = await get(roomRef);
        const currentState = snapshot.val();

        if (currentState.deck.length === 0) return;

        const newDeck = [...currentState.deck];
        const penaltyCard = newDeck.pop();
        const playerHand = [...currentState.players[player].hand, penaltyCard];

        update(roomRef, {
            [`players/${player}/hand`]: playerHand,
            deck: newDeck
        });
    };

    // --- Card Interaction & Special Powers ---
    const handleCardPress = (cardIndex, owner) => {
        if (drawnCard && owner === player) {
            // Normal move: Swap drawn card with one in hand
            const newHand = [...gameState.players[player].hand];
            const cardToDiscard = newHand[cardIndex];
            newHand[cardIndex] = drawnCard;
            setDrawnCard(null);
            update(ref(database, `rooms/${room}`), {
                [`players/${player}/hand`]: newHand,
                discardPile: [...gameState.discardPile, cardToDiscard],
                turn: nextTurn(),
            });
            return;
        }

        if (!specialPower || player !== gameState.turn) return;

        const cardInfo = { cardIndex, owner };

        switch (specialPower.type) {
            case 'peek':
                if (owner === otherPlayer) {
                    const card = gameState.players[otherPlayer].hand[cardIndex];
                    setPeekedCard({ ...card, index: cardIndex, owner });
                    setTimeout(() => {
                        setPeekedCard(null);
                        setSpecialPower(null);
                    }, 2000);
                }
                break;

            case 'blindSwap':
                const newSelections = [...selectedCards, cardInfo];
                setSelectedCards(newSelections);
                if (newSelections.length === 2) {
                    const [first, second] = newSelections;
                    if (first.owner === second.owner) {
                        Alert.alert("Invalid Swap", "Must choose one of your cards and one from your opponent.");
                        setSelectedCards([]);
                        return;
                    }
                    performSwap(first, second);
                }
                break;

            case 'king_peek':
                const card = gameState.players[owner].hand[cardIndex];
                setPeekedCard({ ...card, index: cardIndex, owner });
                setSelectedCards([cardInfo]);
                setSpecialPower({ type: 'king_swap', message: 'BLACK KING: Tap another card to swap, or tap the peeked card again to cancel.' });
                break;

            case 'king_swap':
                if (cardInfo.owner === selectedCards[0].owner && cardInfo.cardIndex === selectedCards[0].cardIndex) {
                    // Cancel swap
                    setSpecialPower(null);
                    setSelectedCards([]);
                    setPeekedCard(null);
                } else {
                    performSwap(selectedCards[0], cardInfo);
                }
                break;
        }
    };

    const performSwap = (card1Info, card2Info) => {
        const roomState = { ...gameState };
        const hand1 = [...roomState.players[card1Info.owner].hand];
        const hand2 = card1Info.owner === card2Info.owner ? hand1 : [...roomState.players[card2Info.owner].hand];
        
        const temp = hand1[card1Info.cardIndex];
        hand1[card1Info.cardIndex] = hand2[card2Info.cardIndex];
        hand2[card2Info.cardIndex] = temp;

        const updates = {};
        updates[`/players/${card1Info.owner}/hand`] = hand1;
        if (card1Info.owner !== card2Info.owner) {
            updates[`/players/${card2Info.owner}/hand`] = hand2;
        }

        update(ref(database, `rooms/${room}`), updates);
        setSpecialPower(null);
        setSelectedCards([]);
        setPeekedCard(null);
    };

    // --- Render Logic ---
    if (!gameState) return <View style={styles.container}><Text style={styles.text}>Loading...</Text></View>;

    const { players, isGameStarted, deck, discardPile, turn, stuckPlayer } = gameState;
    const playerHand = players[player]?.hand;

    return (
        <View 
            style={styles.container}
            onStartShouldSetResponderCapture={() => true}
            onResponderGrant={(evt) => {
                if (evt.nativeEvent.touches.length > 1) {
                    clearTimeout(touchTimer.current);
                    handlePenalty();
                }
            }}
        >
            {specialPower && <Text style={styles.banner}>{specialPower.message}</Text>}
            <Text style={styles.title}>Room: {room} - Turn: {turn}</Text>
            {stuckPlayer && <Text style={styles.text}>{stuckPlayer} has stuck! The round ends after their turn.</Text>}

            {isGameStarted && players[otherPlayer]?.hand ? (
                <View style={styles.gameContainer}>
                    <Text style={styles.text}>Opponent's Hand ({players[otherPlayer].hand.length} cards)</Text>
                    <View style={styles.handContainer}>
                        {players[otherPlayer].hand.map((card, index) => (
                            <Card
                                key={`opp-${index}`}
                                card={card}
                                onPress={() => handleCardPress(index, otherPlayer)}
                                isSelected={selectedCards.some(c => c.cardIndex === index && c.owner === otherPlayer)}
                                isPeeked={peekedCard?.index === index && peekedCard?.owner === otherPlayer}
                            />
                        ))}
                    </View>

                    <View style={styles.tableCenter}>
                         <TouchableOpacity onPress={drawFromDeck} disabled={turn !== player || !!drawnCard || !!specialPower}>
                            <View style={styles.cardBack} />
                            <Text style={styles.text}>Deck ({deck?.length || 0})</Text>
                        </TouchableOpacity>
                        <View style={{alignItems: 'center'}}>
                            <Card card={discardPile[discardPile.length - 1]} isPeeked={true} />
                            <Text style={styles.text}>Discard</Text>
                        </View>
                    </View>

                    {drawnCard && (
                        <View style={styles.drawnCardContainer}>
                            <Text style={styles.text}>You drew:</Text>
                            <Card card={drawnCard} isPeeked={true} />
                            <TouchableOpacity onPress={discardDrawnCard} style={styles.smButton}>
                                <Text style={styles.smButtonText}>Discard</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.text}>Your Hand ({playerHand?.length || 0} cards)</Text>
                    <View style={styles.handContainer}>
                        {playerHand ? playerHand.map((card, index) => (
                            <Card
                                key={`player-${index}`}
                                card={card}
                                onPress={() => handleCardPress(index, player)}
                                isSelected={selectedCards.some(c => c.cardIndex === index && c.owner === player)}
                                isPeeked={true} // Always show own cards
                            />
                        )) : <Text style={styles.text}>Waiting for hand...</Text>}
                    </View>

                    <TouchableOpacity onPress={handleStick} style={styles.button} disabled={!!stuckPlayer}>
                        <Text style={styles.buttonText}>Stick</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.centered}>
                    <Text style={styles.text}>Waiting for other player...</Text>
                    {player === 'player1' && !players.player2 && <Text style={styles.text}>Share room code: {room}</Text>}
                    {player === 'player1' && players.player2 && (
                        <TouchableOpacity style={styles.button} onPress={startGame}>
                            <Text style={styles.buttonText}>Start Game</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <TouchableOpacity onPress={() => router.back()} style={[styles.button, styles.leaveButton]}>
                <Text style={styles.buttonText}>Leave Game</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f3a1d', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 40 },
    gameContainer: { alignItems: 'center', width: '100%' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', color: '#FFD700', marginBottom: 10 },
    text: { fontSize: 16, color: '#fff', textAlign: 'center', marginVertical: 5 },
    banner: { fontSize: 18, fontWeight: 'bold', color: '#0f3a1d', textAlign: 'center', padding: 10, backgroundColor: '#FFD700', width: '100%', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    handContainer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginVertical: 10, minHeight: 95 },
    tableCenter: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', width: '80%', marginVertical: 20 },
    card: { backgroundColor: '#fff', width: 60, height: 85, margin: 5, borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    cardText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
    selectedCard: { borderColor: '#FFD700', borderWidth: 3 },
    cardBack: { backgroundColor: '#b52a2a', width: '100%', height: '100%', borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
    drawnCardContainer: { alignItems: 'center', marginVertical: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10 },
    button: { backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 25, marginVertical: 10 },
    leaveButton: { backgroundColor: '#c84a31' },
    buttonText: { color: 'black', fontSize: 18, fontWeight: 'bold' },
    smButton: { backgroundColor: '#FFC107', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 15, marginTop: 10 },
    smButtonText: { color: 'black', fontSize: 14, fontWeight: 'bold' },
});

export default Game;
