#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <fstream>
#include <ctime>
#include <iomanip>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

using namespace std;

/**
 * @class Transaction
 * @brief Represents a single financial record with date/time.
 */
class Transaction {
public:
    string type;
    double amount;
    string timestamp;

    Transaction(string t, double a) : type(t), amount(a) {
        time_t now = time(0);
        char buf[80];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", localtime(&now));
        timestamp = string(buf);
    }
};

/**
 * @class Account
 * @brief Manages member balance and identity.
 */
class Account {
private:
    int accNo;
    string name;
    double balance;
    vector<Transaction> history;

public:
    Account(int no, string n, double b) : accNo(no), name(n), balance(b) {
        logTransaction("INITIAL", b);
    }

    void updateBalance(double newBal) { balance = newBal; }
    void logTransaction(string t, double a) { history.push_back(Transaction(t, a)); }
    
    int getAccNo() const { return accNo; }
    double getBalance() const { return balance; }
    string getName() const { return name; }

    void showLast5() {
        cout << "\n--- Last 5 Transactions for " << name << " ---" << endl;
        int start = max(0, (int)history.size() - 5);
        for(int i = start; i < history.size(); i++) {
            cout << "[" << history[i].timestamp << "] " << history[i].type << " : ₹" << history[i].amount << endl;
        }
    }
};

/**
 * @class BankSystem
 * @brief Handles vectors and file persistence.
 */
class BankSystem {
private:
    vector<Account> accounts;
    const string DB_NAME = "accounts_db.txt";

public:
    int addAccount(int no, string n, double b) {
        for(auto &a : accounts) if(a.getAccNo() == no) return -1;
        accounts.push_back(Account(no, n, b));
        return no;
    }

    double processDeposit(int no, double amt) {
        for(auto &a : accounts) if(a.getAccNo() == no) {
            double nb = a.getBalance() + amt;
            a.updateBalance(nb); a.logTransaction("DEP", amt);
            return nb;
        }
        return -1.0;
    }

    double processWithdraw(int no, double amt) {
        for(auto &a : accounts) if(a.getAccNo() == no) {
            if(a.getBalance() < amt) return -2.0;
            double nb = a.getBalance() - amt;
            a.updateBalance(nb); a.logTransaction("WIT", amt);
            return nb;
        }
        return -1.0;
    }

    // Requirement: File Persistence
    void saveToFile() {
        ofstream out(DB_NAME);
        for(auto &a : accounts) {
            out << a.getAccNo() << "|" << a.getName() << "|" << a.getBalance() << endl;
        }
        out.close();
    }

    void loadFromFile() {
        ifstream in(DB_NAME);
        if(!in) return;
        accounts.clear();
        int no; string n; double b; string line;
        while(in >> no) {
            in.ignore(1); // skip pipe
            getline(in, n, '|');
            in >> b;
            accounts.push_back(Account(no, n, b));
        }
        in.close();
    }

    double getTotalLiquidity() {
        double total = 0;
        for(auto &a : accounts) total += a.getBalance();
        return total;
    }

    int countLowBalance(double limit) {
        int c = 0;
        for(auto &a : accounts) if(a.getBalance() < limit) c++;
        return c;
    }

    void reset() { accounts.clear(); }
};

BankSystem core;

extern "C" {
    EMSCRIPTEN_KEEPALIVE int create_account(int no, const char* n, double b) { return core.addAccount(no, string(n), b); }
    EMSCRIPTEN_KEEPALIVE double deposit(int no, double amt) { return core.processDeposit(no, amt); }
    EMSCRIPTEN_KEEPALIVE double withdraw(int no, double amt) { return core.processWithdraw(no, amt); }
    EMSCRIPTEN_KEEPALIVE double get_total_money() { return core.getTotalLiquidity(); }
    EMSCRIPTEN_KEEPALIVE int get_below_threshold_count(double limit) { return core.countLowBalance(limit); }
    EMSCRIPTEN_KEEPALIVE void save_system() { core.saveToFile(); }
    EMSCRIPTEN_KEEPALIVE void load_system() { core.loadFromFile(); }
    EMSCRIPTEN_KEEPALIVE void clear_system() { core.reset(); }
}

int main() {
    core.loadFromFile();
    printf("Vaultis AI Engine: Requirement 3.0 Compliance Active.\n");
    return 0;
}
